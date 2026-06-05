'use strict';

/**
 * In-memory abuse and cost guards for a single instance.
 *
 * Instance-per-tenant means one process per business, so in-memory state is
 * enough. State resets on restart, which is acceptable for v1: the rate window
 * is seconds and the daily cap is a coarse cost ceiling, not an exact meter.
 *
 * Limits are read from the environment at call time so a deployment can tune
 * them without code changes.
 */

const RATE_WINDOW_MS = 60_000;

// from -> array of recent request timestamps (ms)
const windows = new Map();

// per-instance daily counter
let daily = { day: null, count: 0 };

function rateLimitPerMin() {
  return parseInt(process.env.RATE_LIMIT_PER_MIN, 10) || 30;
}

function dailyCapLimit() {
  return parseInt(process.env.DAILY_MESSAGE_CAP, 10) || 2000;
}

function dayKey(now) {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Per-number sliding-window rate limit. Records the hit and returns true when
 * the sender is under the limit, false when it has exceeded it this minute.
 */
function checkRate(from, now = Date.now()) {
  const cutoff = now - RATE_WINDOW_MS;
  const hits = (windows.get(from) || []).filter((t) => t > cutoff);

  if (hits.length >= rateLimitPerMin()) {
    windows.set(from, hits);
    return false;
  }

  hits.push(now);
  windows.set(from, hits);
  return true;
}

/**
 * Per-instance daily message cap. Increments the day's counter and returns
 * true while under the cap, false once it is reached. Resets on a new day.
 */
function checkDailyCap(now = Date.now()) {
  const today = dayKey(now);
  if (daily.day !== today) {
    daily = { day: today, count: 0 };
  }

  if (daily.count >= dailyCapLimit()) return false;

  daily.count += 1;
  return true;
}

// Test-only: clear all in-memory state between cases.
function _reset() {
  windows.clear();
  daily = { day: null, count: 0 };
}

module.exports = { checkRate, checkDailyCap, _reset };
