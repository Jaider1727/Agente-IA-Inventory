'use strict';

const db = require('../db/index');

const MAX_MESSAGES = 10;

/**
 * Truncates message history without splitting tool call sequences.
 * A plain slice(-N) can leave orphan 'tool' messages with no preceding
 * 'assistant' + tool_calls, which causes a 400 from OpenAI.
 */
function safeTruncate(messages) {
  if (messages.length <= MAX_MESSAGES) return messages;

  let slice = messages.slice(-MAX_MESSAGES);

  // Walk forward until we find a safe start point:
  // a 'user' message, or an 'assistant' message with text content (not a tool call dispatcher).
  while (slice.length > 0) {
    const first = slice[0];
    if (first.role === 'user') break;
    if (first.role === 'assistant' && first.content && !first.tool_calls?.length) break;
    slice = slice.slice(1);
  }

  return slice;
}

async function loadSession(waNumber) {
  const { rows } = await db.query(
    'SELECT * FROM sessions WHERE wa_number = $1',
    [waNumber]
  );

  if (rows.length === 0) {
    return { waNumber, activeInvoiceId: null, messages: [] };
  }

  const row = rows[0];
  return {
    waNumber: row.wa_number,
    activeInvoiceId: row.active_invoice_id,
    messages: row.messages || [],
  };
}

async function saveSession(waNumber, session) {
  const messages = safeTruncate(session.messages);

  await db.query(
    `INSERT INTO sessions (wa_number, active_invoice_id, messages)
     VALUES ($1, $2, $3)
     ON CONFLICT (wa_number) DO UPDATE
     SET active_invoice_id = $2,
         messages = $3,
         updated_at = NOW()`,
    [waNumber, session.activeInvoiceId, JSON.stringify(messages)]
  );
}

module.exports = { loadSession, saveSession, safeTruncate };
