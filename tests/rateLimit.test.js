'use strict';

const { checkRate, checkDailyCap, _reset } = require('../src/auth/rateLimit');

const ORIGINAL = {
  rate: process.env.RATE_LIMIT_PER_MIN,
  cap: process.env.DAILY_MESSAGE_CAP,
};

beforeEach(() => {
  _reset();
  process.env.RATE_LIMIT_PER_MIN = '3';
  process.env.DAILY_MESSAGE_CAP = '5';
});

afterEach(() => {
  process.env.RATE_LIMIT_PER_MIN = ORIGINAL.rate;
  process.env.DAILY_MESSAGE_CAP = ORIGINAL.cap;
});

describe('checkRate', () => {
  test('allows up to the limit within the window, then rejects', () => {
    const now = 1_000_000;
    expect(checkRate('573001', now)).toBe(true);
    expect(checkRate('573001', now)).toBe(true);
    expect(checkRate('573001', now)).toBe(true);
    expect(checkRate('573001', now)).toBe(false); // 4th in the same minute
  });

  test('frees up once the window slides past 60s', () => {
    const t0 = 1_000_000;
    checkRate('573001', t0);
    checkRate('573001', t0);
    checkRate('573001', t0);
    expect(checkRate('573001', t0)).toBe(false);
    expect(checkRate('573001', t0 + 61_000)).toBe(true); // old hits expired
  });

  test('tracks each number independently', () => {
    const now = 1_000_000;
    checkRate('573001', now);
    checkRate('573001', now);
    checkRate('573001', now);
    expect(checkRate('573001', now)).toBe(false);
    expect(checkRate('573002', now)).toBe(true); // different sender unaffected
  });
});

describe('checkDailyCap', () => {
  test('allows up to the cap, then rejects', () => {
    const now = Date.parse('2026-06-05T10:00:00Z');
    for (let i = 0; i < 5; i++) expect(checkDailyCap(now)).toBe(true);
    expect(checkDailyCap(now)).toBe(false); // 6th exceeds cap of 5
  });

  test('resets the counter on a new calendar day', () => {
    const day1 = Date.parse('2026-06-05T23:00:00Z');
    for (let i = 0; i < 5; i++) checkDailyCap(day1);
    expect(checkDailyCap(day1)).toBe(false);
    const day2 = Date.parse('2026-06-06T00:30:00Z');
    expect(checkDailyCap(day2)).toBe(true); // fresh day, counter reset
  });
});
