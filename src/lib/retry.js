'use strict';

/**
 * Retry helper with exponential backoff for transient network failures.
 *
 * Used to wrap calls to external HTTP services (Meta WhatsApp API). The OpenAI
 * SDK has its own retry config, so it does not need this wrapper.
 */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decides whether an error is worth retrying: network errors (no HTTP
 * response) and the transient HTTP statuses 429 and 5xx. Deterministic 4xx
 * failures (400, 401, 404, ...) are not retried — they will fail every time.
 */
function isRetryable(err) {
  const status = err?.response?.status;
  if (status === undefined) return true; // no response = network/transport error
  return status === 429 || status >= 500;
}

/**
 * Invokes `fn`, retrying on retryable failures with exponential backoff
 * (baseDelay, 2x, 4x, ...). Rethrows the last error once the budget is spent
 * or the error is not retryable.
 */
async function withRetry(fn, { retries = 3, baseDelay = 500, shouldRetry = isRetryable } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !shouldRetry(err)) throw err;
      await sleep(baseDelay * 2 ** (attempt - 1));
    }
  }
}

module.exports = { withRetry, isRetryable };
