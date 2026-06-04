'use strict';

const axios = require('axios');
const { toFile } = require('openai');
const openai = require('../lib/openai');

/**
 * Downloads a WhatsApp audio file and transcribes it with Whisper.
 * WA sends audio in OGG/Opus — Whisper accepts it natively.
 */
async function transcribeAudio(mediaId) {
  const mediaUrl = await resolveMediaUrl(mediaId);
  const audioBuffer = await downloadMedia(mediaUrl);
  return transcribeBuffer(audioBuffer);
}

async function resolveMediaUrl(mediaId) {
  const { data } = await axios.get(
    `https://graph.facebook.com/v20.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${process.env.WA_TOKEN}` } }
  );
  return data.url;
}

async function downloadMedia(url) {
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${process.env.WA_TOKEN}` },
    responseType: 'arraybuffer',
  });
  return Buffer.from(response.data);
}

async function transcribeBuffer(buffer) {
  // toFile() wraps the buffer with the correct filename and MIME type
  // so the SDK can infer the format without relying on stream internals.
  const file = await toFile(buffer, 'audio.ogg', { type: 'audio/ogg' });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: 'whisper-1',
    language: 'es',
  });

  return transcription.text;
}

module.exports = { transcribeAudio };
