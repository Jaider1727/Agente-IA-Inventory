'use strict';

const { normalize, isAuthorized } = require('../src/auth/authorizedNumbers');

describe('normalize', () => {
  test('strips non-digit characters', () => {
    expect(normalize('+57 300 111 2233')).toBe('573001112233');
  });

  test('leaves a clean number untouched', () => {
    expect(normalize('573001112233')).toBe('573001112233');
  });

  test('returns empty string for null or undefined', () => {
    expect(normalize(null)).toBe('');
    expect(normalize(undefined)).toBe('');
  });
});

describe('isAuthorized', () => {
  const ORIGINAL = process.env.AUTHORIZED_NUMBERS;

  afterEach(() => {
    process.env.AUTHORIZED_NUMBERS = ORIGINAL;
  });

  test('authorizes a number present in the list', () => {
    process.env.AUTHORIZED_NUMBERS = '573001112233,573004445566';
    expect(isAuthorized('573001112233')).toBe(true);
    expect(isAuthorized('573004445566')).toBe(true);
  });

  test('matches regardless of formatting differences (+, spaces)', () => {
    process.env.AUTHORIZED_NUMBERS = '+57 300 111 2233';
    expect(isAuthorized('573001112233')).toBe(true);
  });

  test('trims whitespace around list entries', () => {
    process.env.AUTHORIZED_NUMBERS = ' 573001112233 , 573004445566 ';
    expect(isAuthorized('573004445566')).toBe(true);
  });

  test('rejects a number not in the list', () => {
    process.env.AUTHORIZED_NUMBERS = '573001112233';
    expect(isAuthorized('573009998877')).toBe(false);
  });

  test('fails closed when the list is empty or unset', () => {
    process.env.AUTHORIZED_NUMBERS = '';
    expect(isAuthorized('573001112233')).toBe(false);
    delete process.env.AUTHORIZED_NUMBERS;
    expect(isAuthorized('573001112233')).toBe(false);
  });

  test('rejects an empty or undefined sender', () => {
    process.env.AUTHORIZED_NUMBERS = '573001112233';
    expect(isAuthorized('')).toBe(false);
    expect(isAuthorized(undefined)).toBe(false);
  });
});
