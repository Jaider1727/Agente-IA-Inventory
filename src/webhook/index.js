'use strict';

const express = require('express');
const { validateSignature } = require('./validator');
const { parseMessage } = require('./messageParser');
const { transcribeAudio } = require('../audio/transcriber');
const { isAuthorized } = require('../auth/authorizedNumbers');
const { isDuplicate } = require('./dedup');
const { checkRate, checkDailyCap } = require('../auth/rateLimit');
const { loadSession, saveSession } = require('../session/sessionStore');
const { runAgent } = require('../agent/index');
const { sendText } = require('../whatsapp/sender');

const router = express.Router();

// Logs only safe fields — avoids dumping axios request objects with tokens
function safeError(err) {
  if (err?.response) {
    return `HTTP ${err.response.status} ${err.response.statusText} — ${JSON.stringify(err.response.data)}`;
  }
  return err?.message ?? String(err);
}

// Wraps sendText so a WA API failure never causes an unhandled rejection
async function trySend(to, text) {
  try {
    await sendText(to, text);
  } catch (err) {
    console.error('sendText failed:', safeError(err));
  }
}

// Signature validation — needs raw body
router.use(express.json({
  verify: (req, res, buf) => {
    try {
      validateSignature(req, res, buf);
    } catch {
      const err = new Error('Forbidden');
      err.status = 403;
      throw err;
    }
  },
}));

// Meta webhook verification handshake
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Incoming messages
router.post('/', async (req, res) => {
  // Acknowledge immediately to avoid Meta retries
  res.sendStatus(200);

  const parsed = parseMessage(req.body);
  if (!parsed) return;

  // Authorization gate — runs before transcription so an unauthorized number
  // never triggers a paid Whisper call. Silent drop: replying would confirm to
  // a probing sender that the line is active.
  if (!isAuthorized(parsed.from)) {
    console.warn(`Ignored message from unauthorized number: ${parsed.from}`);
    return;
  }

  // Idempotency gate — WhatsApp delivery is at-least-once. Skip a message id
  // we have already processed so a redelivery never creates a second invoice.
  // Runs before transcription so a duplicate audio costs no Whisper call.
  try {
    if (await isDuplicate(parsed.id)) return;
  } catch (err) {
    console.error('Dedup check failed:', safeError(err));
    return; // fail closed: if we can't confirm uniqueness, do not risk a double
  }

  // Abuse guard — drop bursts before they reach the paid OpenAI/Whisper calls.
  if (!checkRate(parsed.from)) {
    await trySend(parsed.from, 'Estás enviando mensajes muy rápido. Esperá unos segundos e intentá de nuevo.');
    return;
  }

  // Cost ceiling — stop the instance once it hits its daily message budget.
  if (!checkDailyCap()) {
    await trySend(parsed.from, 'Se alcanzó el límite diario de mensajes de esta cuenta. Intentá mañana.');
    return;
  }

  const { from, type, text, mediaId } = parsed;

  let userText = text;

  if (type === 'audio') {
    try {
      userText = await transcribeAudio(mediaId);
    } catch (err) {
      console.error('Transcription error:', safeError(err));
      await trySend(from, 'No pude entender el audio. ¿Podés repetirlo?');
      return;
    }
  }

  try {
    const session = await loadSession(from);
    const { reply, updatedSession } = await runAgent(userText, session, from);
    await saveSession(from, updatedSession);
    await trySend(from, reply);
  } catch (err) {
    console.error('Agent error:', safeError(err));
    await trySend(from, 'Ocurrió un error interno. Intentá de nuevo.');
  }
});

module.exports = router;
