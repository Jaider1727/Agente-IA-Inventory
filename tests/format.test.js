'use strict';

const { formatCOP } = require('../src/utils/format');

describe('formatCOP', () => {
  test('formats integer amount with thousands separator', () => {
    expect(formatCOP(12000)).toBe('$12.000');
  });

  test('formats zero', () => {
    expect(formatCOP(0)).toBe('$0');
  });

  test('formats string input', () => {
    expect(formatCOP('5000')).toBe('$5.000');
  });

  test('formats large amount', () => {
    expect(formatCOP(1500000)).toBe('$1.500.000');
  });
});
