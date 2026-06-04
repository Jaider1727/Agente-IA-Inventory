'use strict';

const db = require('../db/index');
const { generateInvoicePdf } = require('../pdf/generator');
const { sendDocument } = require('../whatsapp/mediaUploader');
const { formatCOP } = require('../utils/format');

async function nextReference() {
  const year = new Date().getFullYear();
  const { rows } = await db.query('SELECT next_invoice_reference($1::INT) AS reference', [year]);
  return rows[0].reference;
}

// ─── Facturas ────────────────────────────────────────────────────────────────

async function crearFactura(args, session) {
  const reference = await nextReference();
  const { rows } = await db.query(
    `INSERT INTO invoices (reference, client_name, client_id, destination_city, destination_point, notes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [reference, args.client_name, args.client_id || null,
     args.destination_city || null, args.destination_point || null, args.notes || null]
  );

  session.activeInvoiceId = rows[0].id;

  const destino = [args.destination_city, args.destination_point].filter(Boolean).join(' — ');
  const destinoText = destino ? ` → ${destino}` : '';
  return `Factura ${reference} creada para ${args.client_name}${destinoText}. ¿Qué le agrego?`;
}

async function agregarItem(args, session) {
  if (!session.activeInvoiceId) {
    return 'No hay factura activa. Primero creá una factura con el nombre del cliente.';
  }

  // Find product in catalog to link and check stock
  const { rows: products } = await db.query(
    `SELECT * FROM products WHERE active = TRUE AND name ILIKE $1 LIMIT 1`,
    [args.description]
  );
  const product = products[0] || null;

  if (product) {
    const available = Number(product.stock);
    if (available < args.quantity) {
      return `⚠️ Stock insuficiente: hay ${available} ${product.unit} de "${product.name}" disponibles. ¿Cambiás la cantidad?`;
    }
  }

  await db.query(
    `INSERT INTO invoice_items (invoice_id, product_id, description, quantity, unit_price)
     VALUES ($1, $2, $3, $4, $5)`,
    [session.activeInvoiceId, product?.id || null, args.description, args.quantity, args.unit_price]
  );

  const subtotal = args.quantity * args.unit_price;
  let msg = `Agregado: ${args.quantity}x ${args.description} = ${formatCOP(subtotal)}`;

  if (product) {
    const stockAfter = Number(product.stock) - args.quantity;
    if (stockAfter <= Number(product.stock_min)) {
      msg += `\n⚠️ Quedarán ${stockAfter} ${product.unit} en inventario (mínimo: ${product.stock_min})`;
    }
  }

  return msg;
}

async function verFactura(session) {
  if (!session.activeInvoiceId) {
    return 'No hay factura activa.';
  }

  const { rows: inv } = await db.query(
    'SELECT * FROM invoices WHERE id = $1',
    [session.activeInvoiceId]
  );
  const { rows: items } = await db.query(
    'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id',
    [session.activeInvoiceId]
  );

  const invoice = inv[0];
  const destino = [invoice.destination_city, invoice.destination_point].filter(Boolean).join(' — ');
  const destinoLine = destino ? `Destino: ${destino}\n` : '';
  const itemLines = items.map((i) => `  - ${i.quantity}x ${i.description}: ${formatCOP(i.total)}`).join('\n');
  const total = items.reduce((sum, i) => sum + Number(i.total), 0);

  return `*${invoice.reference}*\nCliente: ${invoice.client_name}\n${destinoLine}${itemLines}\n*Total: ${formatCOP(total)}*`;
}

async function finalizarFactura(session) {
  if (!session.activeInvoiceId) {
    return 'No hay factura activa.';
  }

  const invoiceId = session.activeInvoiceId;

  // Read items before acquiring the transaction client (read-only, no tx needed)
  const { rows: items } = await db.query(
    'SELECT * FROM invoice_items WHERE invoice_id = $1',
    [invoiceId]
  );

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE invoices SET status = 'finalized' WHERE id = $1`,
      [invoiceId]
    );

    // Deduct stock and log movements for catalog-linked items
    for (const item of items) {
      if (!item.product_id) continue;
      await client.query(
        `UPDATE products SET stock = stock - $1 WHERE id = $2`,
        [item.quantity, item.product_id]
      );
      await client.query(
        `INSERT INTO stock_movements (product_id, invoice_id, type, quantity, notes)
         VALUES ($1, $2, 'exit', $3, 'despacho')`,
        [item.product_id, invoiceId, item.quantity]
      );
    }

    await client.query('COMMIT');
    session.activeInvoiceId = null; // only after successful COMMIT
  } catch (err) {
    await client.query('ROLLBACK');
    throw err; // surface to webhook error handler
  } finally {
    client.release();
  }

  // Summary read runs outside the transaction, on the shared pool
  const summary = await verFacturaPorId(invoiceId);
  return `${summary}\n\n✓ Factura despachada. Inventario actualizado.`;
}

async function cancelarFactura(session) {
  if (!session.activeInvoiceId) {
    return 'No hay factura activa.';
  }
  await db.query(`UPDATE invoices SET status = 'cancelled' WHERE id = $1`, [session.activeInvoiceId]);
  session.activeInvoiceId = null;
  return 'Factura cancelada.';
}

async function devolverFactura(args) {
  const { rows: inv } = await db.query(
    `SELECT * FROM invoices WHERE reference = $1`,
    [args.reference]
  );

  if (!inv.length) return `No encontré la factura ${args.reference}.`;
  const invoice = inv[0];

  if (invoice.status !== 'finalized') {
    return `La factura ${args.reference} no puede devolverse (estado actual: ${invoice.status}).`;
  }

  const { rows: items } = await db.query(
    `SELECT * FROM invoice_items WHERE invoice_id = $1`,
    [invoice.id]
  );

  await db.query(`UPDATE invoices SET status = 'returned' WHERE id = $1`, [invoice.id]);

  for (const item of items) {
    if (!item.product_id) continue;
    await db.query(
      `UPDATE products SET stock = stock + $1 WHERE id = $2`,
      [item.quantity, item.product_id]
    );
    await db.query(
      `INSERT INTO stock_movements (product_id, invoice_id, type, quantity, notes)
       VALUES ($1, $2, 'return', $3, 'devolución')`,
      [item.product_id, invoice.id, item.quantity]
    );
  }

  const repuesto = items
    .filter((i) => i.product_id)
    .map((i) => `  +${i.quantity}x ${i.description}`)
    .join('\n');

  return `✓ Factura ${args.reference} devuelta.\nStock repuesto:\n${repuesto || '  (ningún ítem vinculado al catálogo)'}`;
}

// ─── Inventario ───────────────────────────────────────────────────────────────

async function consultarStock(args) {
  const filter = args.query ? `%${args.query}%` : '%';
  const { rows } = await db.query(
    `SELECT * FROM products WHERE active = TRUE AND name ILIKE $1 ORDER BY name`,
    [filter]
  );

  if (!rows.length) return 'No hay productos registrados en el catálogo.';

  const lines = rows.map((p) => {
    const low = Number(p.stock) <= Number(p.stock_min);
    const icon = low ? '⚠️' : '✓';
    const min = Number(p.stock_min) > 0 ? ` (mín: ${p.stock_min})` : '';
    return `  ${icon} ${p.name}: ${p.stock} ${p.unit}${min}`;
  }).join('\n');

  return `📦 Inventario:\n${lines}`;
}

async function agregarAlCatalogo(args) {
  const { rows: existing } = await db.query(
    `SELECT id FROM products WHERE name ILIKE $1`,
    [args.name]
  );

  if (existing.length) {
    return `El producto "${args.name}" ya existe. Usá actualizar_producto para modificarlo.`;
  }

  const stock = Number(args.stock) || 0;
  const { rows } = await db.query(
    `INSERT INTO products (name, default_price, unit, stock, stock_min)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [args.name, args.default_price, args.unit || 'unidad', stock, Number(args.stock_min) || 0]
  );

  if (stock > 0) {
    await db.query(
      `INSERT INTO stock_movements (product_id, type, quantity, notes)
       VALUES ($1, 'entry', $2, 'stock inicial')`,
      [rows[0].id, stock]
    );
  }

  return `"${args.name}" agregado al catálogo a ${formatCOP(args.default_price)}/${args.unit || 'unidad'}. Stock inicial: ${stock} uds.`;
}

async function actualizarProducto(args) {
  const { rows } = await db.query(
    `SELECT * FROM products WHERE name ILIKE $1 AND active = TRUE LIMIT 1`,
    [args.name]
  );

  if (!rows.length) return `No encontré el producto "${args.name}".`;
  const p = rows[0];

  await db.query(
    `UPDATE products SET name = $1, default_price = $2, unit = $3, stock_min = $4 WHERE id = $5`,
    [
      args.new_name    ?? p.name,
      args.new_price   ?? p.default_price,
      args.new_unit    ?? p.unit,
      args.new_stock_min ?? p.stock_min,
      p.id,
    ]
  );

  return `Producto "${p.name}" actualizado.`;
}

async function ajustarStock(args) {
  const { rows } = await db.query(
    `SELECT * FROM products WHERE name ILIKE $1 AND active = TRUE LIMIT 1`,
    [args.name]
  );

  if (!rows.length) return `No encontré el producto "${args.name}".`;
  const p = rows[0];

  let newStock, delta, movType;

  if (args.type === 'adjustment') {
    newStock = args.quantity;
    delta = Math.abs(args.quantity - Number(p.stock));
    movType = 'adjustment';
  } else {
    newStock = Number(p.stock) + args.quantity;
    delta = args.quantity;
    movType = 'entry';
  }

  await db.query(`UPDATE products SET stock = $1 WHERE id = $2`, [newStock, p.id]);
  await db.query(
    `INSERT INTO stock_movements (product_id, type, quantity, notes)
     VALUES ($1, $2, $3, $4)`,
    [p.id, movType, delta, args.notes || null]
  );

  return `Stock de "${p.name}" actualizado: ${newStock} ${p.unit}.`;
}

async function buscarProducto(args) {
  const { rows } = await db.query(
    `SELECT * FROM products WHERE active = TRUE AND name ILIKE $1 ORDER BY name LIMIT 5`,
    [`%${args.query}%`]
  );

  if (!rows.length) return `No encontré "${args.query}" en el catálogo. Indicá el precio y lo agrego.`;

  const lines = rows.map((p) => {
    const low = Number(p.stock) <= Number(p.stock_min) && Number(p.stock_min) > 0;
    const stockInfo = ` | Stock: ${p.stock} ${p.unit}${low ? ' ⚠️' : ''}`;
    return `  - ${p.name}: ${formatCOP(p.default_price)}/${p.unit}${stockInfo}`;
  }).join('\n');

  return `Encontré en el catálogo:\n${lines}`;
}

// ─── Catálogo de clientes ─────────────────────────────────────────────────────

async function buscarCliente(args) {
  const { rows } = await db.query(
    `SELECT * FROM clients WHERE active = TRUE AND name ILIKE $1 ORDER BY name LIMIT 3`,
    [`%${args.query}%`]
  );

  if (!rows.length) return `No encontré "${args.query}" en el catálogo de clientes.`;

  const lines = rows.map((c) => {
    const destino = [c.destination_city, c.destination_point].filter(Boolean).join(' — ');
    const nit = c.client_id ? ` | NIT: ${c.client_id}` : '';
    const dest = destino ? ` | Destino: ${destino}` : '';
    return `  - ${c.name}${nit}${dest}`;
  }).join('\n');

  return `Encontré en el catálogo:\n${lines}`;
}

async function agregarCliente(args) {
  await db.query(
    `INSERT INTO clients (name, client_id, destination_city, destination_point)
     VALUES ($1, $2, $3, $4)`,
    [args.name, args.client_id || null, args.destination_city || null, args.destination_point || null]
  );

  const destino = [args.destination_city, args.destination_point].filter(Boolean).join(' — ');
  return `"${args.name}" guardado en el catálogo de clientes${destino ? ` (${destino})` : ''}.`;
}

// ─── Exportación ──────────────────────────────────────────────────────────────

async function exportarFactura(args, session, waNumber) {
  const invoiceId = session.activeInvoiceId;
  if (!invoiceId && !args.reference) return 'No hay factura activa para exportar.';

  const { rows: inv } = await db.query(
    args.reference ? `SELECT * FROM invoices WHERE reference = $1` : `SELECT * FROM invoices WHERE id = $1`,
    [args.reference || invoiceId]
  );
  if (!inv.length) return 'No encontré esa factura.';

  const invoice = inv[0];
  const { rows: items } = await db.query(
    `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id`,
    [invoice.id]
  );

  const pdfBuffer = await generateInvoicePdf(invoice, items);
  await sendDocument(waNumber, pdfBuffer, `${invoice.reference}.pdf`);
  return `PDF de ${invoice.reference} enviado.`;
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

async function verFacturaPorId(invoiceId) {
  const { rows: inv } = await db.query(`SELECT * FROM invoices WHERE id = $1`, [invoiceId]);
  const { rows: items } = await db.query(
    `SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id`,
    [invoiceId]
  );
  const invoice = inv[0];
  const destino = [invoice.destination_city, invoice.destination_point].filter(Boolean).join(' — ');
  const destinoLine = destino ? `Destino: ${destino}\n` : '';
  const itemLines = items.map((i) => `  - ${i.quantity}x ${i.description}: ${formatCOP(i.total)}`).join('\n');
  const total = items.reduce((sum, i) => sum + Number(i.total), 0);
  return `*${invoice.reference}*\nCliente: ${invoice.client_name}\n${destinoLine}${itemLines}\n*Total: ${formatCOP(total)}*`;
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────

async function handleTool(toolName, args, session, waNumber) {
  switch (toolName) {
    case 'crear_factura':       return crearFactura(args, session);
    case 'agregar_item':        return agregarItem(args, session);
    case 'ver_factura':         return verFactura(session);
    case 'finalizar_factura':   return finalizarFactura(session);
    case 'cancelar_factura':    return cancelarFactura(session);
    case 'devolver_factura':    return devolverFactura(args);
    case 'buscar_producto':     return buscarProducto(args);
    case 'agregar_al_catalogo': return agregarAlCatalogo(args);
    case 'consultar_stock':     return consultarStock(args);
    case 'actualizar_producto': return actualizarProducto(args);
    case 'ajustar_stock':       return ajustarStock(args);
    case 'buscar_cliente':      return buscarCliente(args);
    case 'agregar_cliente':     return agregarCliente(args);
    case 'exportar_factura':    return exportarFactura(args, session, waNumber);
    default:                    return `Tool desconocida: ${toolName}`;
  }
}

module.exports = { handleTool };
