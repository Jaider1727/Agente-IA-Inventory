'use strict';

require('dotenv').config();

const REQUIRED_ENV = ['WA_TOKEN', 'WA_PHONE_ID', 'VERIFY_TOKEN', 'WA_APP_SECRET', 'OPENAI_API_KEY', 'DATABASE_URL', 'AUTHORIZED_NUMBERS', 'BUSINESS_NAME'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const express = require('express');
const webhookRouter = require('./webhook/index');

const app = express();

// express.json() is intentionally NOT added here globally.
// The webhook router registers its own parser with the HMAC verify callback,
// which needs access to the raw body buffer before any parsing occurs.

app.use('/webhook', webhookRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
