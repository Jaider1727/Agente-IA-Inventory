'use strict';

const db = require('../db/index');

/**
 * Message-level idempotency for the WhatsApp webhook.
 *
 * WhatsApp delivery is at-least-once: the same message id can arrive more than
 * once. Without a guard, a retried "create invoice" could be processed twice.
 *
 * We dedup on receipt (insert the id before processing), not on success. This
 * favors never double-creating an invoice over the rarer case of dropping a
 * message that errored mid-processing — the user can simply resend that one.
 */

/**
 * Records the message id and reports whether it was already seen.
 * Returns true if this id was processed before (caller should skip).
 * A missing id cannot be deduped, so it is treated as not-duplicate.
 */
async function isDuplicate(messageId) {
  if (!messageId) return false;

  const { rows } = await db.query(
    `INSERT INTO processed_messages (message_id) VALUES ($1)
     ON CONFLICT (message_id) DO NOTHING
     RETURNING message_id`,
    [messageId]
  );

  return rows.length === 0;
}

module.exports = { isDuplicate };
