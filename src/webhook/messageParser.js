'use strict';

/**
 * Extracts sender, message type and relevant content from a WA Cloud API payload.
 * Returns null if the payload has no actionable message.
 */
function parseMessage(body) {
  const entry = body?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  if (!value?.messages?.length) return null;

  const message = value.messages[0];
  const id = message.id;
  const from = message.from;

  if (message.type === 'text') {
    return { id, from, type: 'text', text: message.text.body };
  }

  if (message.type === 'audio') {
    return { id, from, type: 'audio', mediaId: message.audio.id };
  }

  return null;
}

module.exports = { parseMessage };
