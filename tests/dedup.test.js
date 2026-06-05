'use strict';

jest.mock('../src/db/index', () => ({ query: jest.fn() }));

const db = require('../src/db/index');
const { isDuplicate } = require('../src/webhook/dedup');

describe('isDuplicate', () => {
  beforeEach(() => {
    db.query.mockReset();
  });

  test('returns false the first time a message id is seen (row inserted)', async () => {
    db.query.mockResolvedValue({ rows: [{ message_id: 'wamid.1' }] });
    await expect(isDuplicate('wamid.1')).resolves.toBe(false);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  test('returns true when the id already exists (insert hit conflict)', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(isDuplicate('wamid.1')).resolves.toBe(true);
  });

  test('returns false without touching the DB when id is missing', async () => {
    await expect(isDuplicate(undefined)).resolves.toBe(false);
    await expect(isDuplicate('')).resolves.toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });
});
