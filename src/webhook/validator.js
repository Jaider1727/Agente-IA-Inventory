'use strict';

const crypto = require('crypto');

/**
 * Validates the X-Hub-Signature-256 header sent by Meta.
 * Must run BEFORE express.json() parses the body, so rawBody is preserved.
 */
function validateSignature(req, res, buf) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', process.env.WA_APP_SECRET)
    .update(buf)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error('Invalid signature');
  }
}

module.exports = { validateSignature };
