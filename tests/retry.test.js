'use strict';

const { withRetry, isRetryable } = require('../src/lib/retry');

function httpError(status) {
  return { response: { status } };
}

describe('isRetryable', () => {
  test('retries on 429 and 5xx', () => {
    expect(isRetryable(httpError(429))).toBe(true);
    expect(isRetryable(httpError(500))).toBe(true);
    expect(isRetryable(httpError(503))).toBe(true);
  });

  test('retries on network errors (no HTTP response)', () => {
    expect(isRetryable(new Error('ECONNRESET'))).toBe(true);
  });

  test('does not retry on 4xx other than 429', () => {
    expect(isRetryable(httpError(400))).toBe(false);
    expect(isRetryable(httpError(404))).toBe(false);
  });
});

describe('withRetry', () => {
  test('returns immediately on success without extra calls', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    await expect(withRetry(fn, { baseDelay: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries a transient failure then succeeds', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValue('ok');
    await expect(withRetry(fn, { baseDelay: 0 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('gives up after the retry budget and throws the last error', async () => {
    const fn = jest.fn().mockRejectedValue(httpError(500));
    await expect(withRetry(fn, { retries: 2, baseDelay: 0 })).rejects.toEqual(httpError(500));
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  test('does not retry a non-retryable error', async () => {
    const fn = jest.fn().mockRejectedValue(httpError(400));
    await expect(withRetry(fn, { baseDelay: 0 })).rejects.toEqual(httpError(400));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
