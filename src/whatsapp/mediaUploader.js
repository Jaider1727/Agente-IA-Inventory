'use strict';

const axios = require('axios');
const { WA_BASE } = require('../lib/whatsapp');
const { withRetry } = require('../lib/retry');

/**
 * Uploads a buffer as a document to the WA Media API,
 * then sends it as a document message to the recipient.
 * Uses native FormData (Node >= 20).
 */
async function sendDocument(to, buffer, filename) {
  const mediaId = await uploadMedia(buffer, filename);
  await sendDocumentMessage(to, mediaId, filename);
}

async function uploadMedia(buffer, filename) {
  const form = new FormData();
  const blob = new Blob([buffer], { type: 'application/pdf' });
  form.append('file', blob, filename);
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');

  const { data } = await withRetry(() => axios.post(
    `${WA_BASE}/${process.env.WA_PHONE_ID}/media`,
    form,
    {
      headers: { Authorization: `Bearer ${process.env.WA_TOKEN}` },
    }
  ));

  return data.id;
}

async function sendDocumentMessage(to, mediaId, filename) {
  await withRetry(() => axios.post(
    `${WA_BASE}/${process.env.WA_PHONE_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: { id: mediaId, filename },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  ));
}

module.exports = { sendDocument };
