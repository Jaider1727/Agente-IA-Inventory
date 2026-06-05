'use strict';

const { generateInvoicePdf } = require('../src/pdf/generator');

const invoice = {
  reference: 'REM-2026-001',
  client_name: 'Tienda La Esquina',
  client_id: '900123456-7',
  destination_city: 'Cali',
  destination_point: 'Local 5',
  status: 'finalized',
  notes: null,
  created_at: '2026-06-05T10:00:00Z',
};

function makeItems(n) {
  return Array.from({ length: n }, (_, i) => ({
    description: `Producto ${i + 1}`,
    quantity: 2,
    unit_price: 12000,
    total: 24000,
  }));
}

describe('generateInvoicePdf', () => {
  test('produces a valid PDF buffer', async () => {
    const buf = await generateInvoicePdf(invoice, makeItems(3));
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 5).toString()).toBe('%PDF-'); // PDF magic number
  });

  test('handles a long item list without throwing (page-break path)', async () => {
    const buf = await generateInvoicePdf(invoice, makeItems(120));
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  test('renders without optional seller env vars set', async () => {
    const prev = process.env.BUSINESS_NAME;
    delete process.env.BUSINESS_NAME;
    const buf = await generateInvoicePdf(invoice, makeItems(1));
    expect(buf.slice(0, 5).toString()).toBe('%PDF-');
    process.env.BUSINESS_NAME = prev;
  });
});
