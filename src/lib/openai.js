'use strict';

const { OpenAI } = require('openai');

// maxRetries lets the SDK transparently retry 429/5xx/network errors with
// backoff; timeout caps a hung request so a stuck call cannot block forever.
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 30000,
});

module.exports = openai;
