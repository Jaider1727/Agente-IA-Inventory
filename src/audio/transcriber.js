'use strict';

const axios = require('axios');
const { toFile } = require('openai');
const openai = require('../lib/openai');
const { withRetry } = require('../lib/retry');

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
  const { data } = await withRetry(() => axios.get(
    `https://graph.facebook.com/v20.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${process.env.WA_TOKEN}` } }
  ));
  return data.url;
}

async function downloadMedia(url) {
  const response = await withRetry(() => axios.get(url, {
    headers: { Authorization: `Bearer ${process.env.WA_TOKEN}` },
    responseType: 'arraybuffer',
  }));
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
    prompt:
      'Bocadillo de guayaba, 100 gramos, 200 gramos, 300 gramos, 500 gramos, 1 kilo, 2 kilos, ' +
      'factura, inventario, despacho, devolución, NIT, precio unitario, stock, catálogo, ' +
      'agregar, cancelar, confirmar, ajustar, entrada de mercancía.',
  });

  return transcription.text;
}

module.exports = { transcribeAudio };
