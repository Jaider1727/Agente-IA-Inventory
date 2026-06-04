'use strict';

const axios = require('axios');
const { WA_BASE } = require('../lib/whatsapp');

async function sendText(to, text) {
  await axios.post(
    `${WA_BASE}/${process.env.WA_PHONE_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WA_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

module.exports = { sendText };
