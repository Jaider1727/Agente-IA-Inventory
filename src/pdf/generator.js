'use strict';

const PDFDocument = require('pdfkit');
const { formatCOP } = require('../utils/format');

/**
 * Generates an invoice PDF in memory and returns a Buffer.
 * No disk writes — streams directly to a buffer.
 */
function generateInvoicePdf(invoice, items) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(20).text('FACTURA DE DESPACHO', { align: 'center' });
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

    // Items table header
    doc.fontSize(10)
      .text('Descripción', 50, doc.y, { width: 220, continued: false })
      .text('Cantidad',    270, doc.y - doc.currentLineHeight(), { width: 80, align: 'right' })
      .text('Precio unit.', 350, doc.y - doc.currentLineHeight(), { width: 90, align: 'right' })
      .text('Subtotal',    440, doc.y - doc.currentLineHeight(), { width: 90, align: 'right' });

    doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
    doc.moveDown(0.3);

    // Items
    let total = 0;
    for (const item of items) {
      const y = doc.y;
      doc.text(item.description,               50, y, { width: 220 });
      doc.text(String(item.quantity),          270, y, { width: 80, align: 'right' });
      doc.text(formatCOP(item.unit_price),     350, y, { width: 90, align: 'right' });
      doc.text(formatCOP(item.total),          440, y, { width: 90, align: 'right' });
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
