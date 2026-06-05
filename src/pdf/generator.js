'use strict';

const PDFDocument = require('pdfkit');
const { formatCOP } = require('../utils/format');

// Y position past which a new page is started before drawing the next row.
// A4 is ~842pt tall with a 50pt margin; 720 leaves room for a row + footer.
const PAGE_BREAK_Y = 720;

/**
 * Draws the seller identity block from environment config. Each instance
 * (one business) sets its own BUSINESS_* vars. Only BUSINESS_NAME is required.
 */
function drawSellerHeader(doc) {
  doc.fontSize(16).text(process.env.BUSINESS_NAME || '', { align: 'left' });
  doc.fontSize(9);
  if (process.env.BUSINESS_NIT) doc.text(`NIT: ${process.env.BUSINESS_NIT}`);
  if (process.env.BUSINESS_ADDRESS) doc.text(process.env.BUSINESS_ADDRESS);
  if (process.env.BUSINESS_PHONE) doc.text(`Tel: ${process.env.BUSINESS_PHONE}`);
}

/** Draws the items table column headers at the current y. */
function drawTableHeader(doc) {
  const y = doc.y;
  doc.fontSize(10)
    .text('Descripción', 50, y, { width: 220 })
    .text('Cantidad', 270, y, { width: 80, align: 'right' })
    .text('Precio unit.', 350, y, { width: 90, align: 'right' })
    .text('Subtotal', 440, y, { width: 90, align: 'right' });

  doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
  doc.moveDown(0.3);
}

/**
 * Generates a delivery-note PDF in memory and returns a Buffer.
 * No disk writes — streams directly to a buffer.
 */
function generateInvoicePdf(invoice, items) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Seller identity
    drawSellerHeader(doc);
    doc.moveDown(0.8);

    // Document title — REMISIÓN, not "FACTURA" (non-fiscal delivery note)
    doc.fontSize(20).text('REMISIÓN', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).text(invoice.reference, { align: 'center' });
    doc.moveDown(1);

    // Invoice metadata
    doc.fontSize(11);
    doc.text(`Cliente:    ${invoice.client_name}`);
    if (invoice.client_id) doc.text(`NIT/Cédula: ${invoice.client_id}`);
    if (invoice.destination_city || invoice.destination_point) {
      const destino = [invoice.destination_city, invoice.destination_point].filter(Boolean).join(' — ');
      doc.text(`Destino:    ${destino}`);
    }
    doc.text(`Fecha:      ${new Date(invoice.created_at).toLocaleDateString('es-CO')}`);
    doc.text(`Estado:     ${invoice.status.toUpperCase()}`);
    if (invoice.notes) doc.text(`Notas:      ${invoice.notes}`);

    doc.moveDown(1);

    // Items table
    drawTableHeader(doc);

    let total = 0;
    for (const item of items) {
      // Start a new page (with a fresh header) before a row would overflow.
      if (doc.y > PAGE_BREAK_Y) {
        doc.addPage();
        drawTableHeader(doc);
      }

      const y = doc.y;
      doc.fontSize(10);
      doc.text(item.description,           50, y, { width: 220 });
      doc.text(String(item.quantity),      270, y, { width: 80, align: 'right' });
      doc.text(formatCOP(item.unit_price), 350, y, { width: 90, align: 'right' });
      doc.text(formatCOP(item.total),      440, y, { width: 90, align: 'right' });
      doc.moveDown(0.2);
      total += Number(item.total);
    }

    // Total line
    doc.moveDown(0.5);
    doc.moveTo(350, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);
    doc.fontSize(12).text(`TOTAL: ${formatCOP(total)}`, { align: 'right' });

    doc.end();
  });
}

module.exports = { generateInvoicePdf };
