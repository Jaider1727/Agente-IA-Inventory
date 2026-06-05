-- Migration 005: webhook idempotency.
-- WhatsApp delivery is at-least-once; this table lets the webhook skip a
-- message id it has already processed, preventing duplicate invoices.

CREATE TABLE IF NOT EXISTS processed_messages (
  message_id TEXT PRIMARY KEY,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Old rows can be pruned periodically (ids only matter for the retry window):
--   DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '7 days';

-- Rollback: DROP TABLE IF EXISTS processed_messages;
