'use strict';

// Mock the DB layer: query() for the shared pool, and pool.connect() returning
// a transaction client with its own query()/release().
jest.mock('../src/db/index', () => {
  const client = { query: jest.fn(), release: jest.fn() };
  return {
    query: jest.fn(),
    pool: { connect: jest.fn() },
    __client: client,
  };
});

const db = require('../src/db/index');
const client = db.__client;
const { handleTool } = require('../src/agent/toolHandlers');

/** Finds the first mocked call whose SQL contains `substr`. */
function callWith(mockFn, substr) {
  return mockFn.mock.calls.find(([sql]) => sql.includes(substr));
}

beforeEach(() => {
  db.query.mockReset();
  client.query.mockReset().mockResolvedValue({});
  client.release.mockReset();
  db.pool.connect.mockReset().mockResolvedValue(client);
});

describe('crear_factura', () => {
  test('allocates a reference and sets the active invoice on the session', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ reference: 'REM-2026-001' }] }) // next_invoice_reference
      .mockResolvedValueOnce({ rows: [{ id: 42 }] });                   // INSERT invoices
    const session = { activeInvoiceId: null };

    const res = await handleTool('crear_factura', { client_name: 'Tienda X' }, session);

    expect(session.activeInvoiceId).toBe(42);
    expect(res).toContain('REM-2026-001');
  });
});

describe('agregar_item', () => {
  test('rejects when stock is insufficient and does not insert', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 5, name: 'Camisetas', stock: '10', stock_min: '2', unit: 'unidad' }],
    });
    const session = { activeInvoiceId: 1 };

    const res = await handleTool('agregar_item', { description: 'Camisetas', quantity: 50, unit_price: 12000 }, session);

    expect(res).toMatch(/insuficiente/i);
    expect(db.query).toHaveBeenCalledTimes(1); // lookup only, no INSERT
  });

  test('inserts the item and warns when resulting stock falls below minimum', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 5, name: 'Camisetas', stock: '10', stock_min: '5', unit: 'unidad' }] })
      .mockResolvedValueOnce({}); // INSERT invoice_items
    const session = { activeInvoiceId: 1 };

    const res = await handleTool('agregar_item', { description: 'Camisetas', quantity: 8, unit_price: 12000 }, session);

    expect(res).toContain('Agregado');
    expect(res).toContain('2'); // 10 - 8 = 2 remaining
    expect(callWith(db.query, 'INSERT INTO invoice_items')).toBeTruthy();
  });

  test('refuses when there is no active invoice', async () => {
    const res = await handleTool('agregar_item', { description: 'X', quantity: 1, unit_price: 100 }, { activeInvoiceId: null });
    expect(res).toMatch(/no hay factura activa/i);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('finalizar_factura', () => {
  const invoice = { id: 1, reference: 'REM-2026-007', client_name: 'Tienda X', destination_city: null, destination_point: null };
  const items = [{ product_id: 5, quantity: 3, description: 'Camisetas', total: '36000' }];

  test('deducts stock inside a committed transaction and clears the active invoice', async () => {
    db.query
      .mockResolvedValueOnce({ rows: items })        // read items to dispatch
      .mockResolvedValueOnce({ rows: [invoice] })    // verFacturaPorId: invoice
      .mockResolvedValueOnce({ rows: items });       // verFacturaPorId: items
    const session = { activeInvoiceId: 1 };

    const res = await handleTool('finalizar_factura', {}, session);

    expect(callWith(client.query, 'BEGIN')).toBeTruthy();
    expect(callWith(client.query, 'COMMIT')).toBeTruthy();
    const stockUpdate = callWith(client.query, 'UPDATE products SET stock = stock - $1');
    expect(stockUpdate[1]).toEqual([3, 5]); // [quantity, product_id]
    expect(session.activeInvoiceId).toBeNull();
    expect(res).toContain('despachada');
  });

  test('rolls back and keeps the active invoice when a write fails', async () => {
    db.query.mockResolvedValueOnce({ rows: items }); // read items
    client.query.mockImplementation((sql) => {
      if (sql.includes('UPDATE invoices')) return Promise.reject(new Error('db down'));
      return Promise.resolve({});
    });
    const session = { activeInvoiceId: 1 };

    await expect(handleTool('finalizar_factura', {}, session)).rejects.toThrow('db down');
    expect(callWith(client.query, 'ROLLBACK')).toBeTruthy();
    expect(session.activeInvoiceId).toBe(1); // unchanged — never committed
  });
});

describe('devolver_factura', () => {
  test('restores stock for a finalized invoice', async () => {
    const invoice = { id: 9, reference: 'REM-2026-003', status: 'finalized' };
    const items = [{ product_id: 7, quantity: 4, description: 'Gorras' }];
    db.query
      .mockResolvedValueOnce({ rows: [invoice] }) // SELECT invoice by reference
      .mockResolvedValueOnce({ rows: items })     // SELECT items
      .mockResolvedValueOnce({})                  // UPDATE invoices -> returned
      .mockResolvedValueOnce({})                  // UPDATE products + stock
      .mockResolvedValueOnce({});                 // INSERT movement

    const res = await handleTool('devolver_factura', { reference: 'REM-2026-003' });

    const stockUpdate = callWith(db.query, 'UPDATE products SET stock = stock + $1');
    expect(stockUpdate[1]).toEqual([4, 7]); // [quantity, product_id]
    expect(res).toMatch(/devuelta/i);
  });

  test('refuses to return an invoice that is not finalized', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ id: 9, reference: 'REM-2026-003', status: 'draft' }] });
    const res = await handleTool('devolver_factura', { reference: 'REM-2026-003' });
    expect(res).toMatch(/no puede devolverse/i);
  });
});

describe('ajustar_stock', () => {
  test('entry adds to the current stock', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 3, name: 'Bolsas', stock: '10', unit: 'unidad' }] })
      .mockResolvedValueOnce({})  // UPDATE products
      .mockResolvedValueOnce({}); // INSERT movement

    const res = await handleTool('ajustar_stock', { name: 'Bolsas', quantity: 5, type: 'entry' });

    expect(callWith(db.query, 'UPDATE products SET stock')[1]).toEqual([15, 3]); // 10 + 5
    expect(res).toContain('15');
  });

  test('adjustment sets the stock to the exact value', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 3, name: 'Bolsas', stock: '10', unit: 'unidad' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const res = await handleTool('ajustar_stock', { name: 'Bolsas', quantity: 3, type: 'adjustment' });

    expect(callWith(db.query, 'UPDATE products SET stock')[1]).toEqual([3, 3]); // exact set
    const movement = callWith(db.query, 'INSERT INTO stock_movements');
    expect(movement[1]).toEqual([3, 'adjustment', 7, null]); // delta = |3 - 10| = 7
    expect(res).toContain('3');
  });
});
