'use strict';

/**
 * Authorization allowlist for inbound WhatsApp senders.
 *
 * v1 uses a flat allowlist: every number in AUTHORIZED_NUMBERS has full
 * access. There is no admin/operator role distinction yet.
 *
 * The list is read from the environment on each call so a deployment can
 * change it without code edits. The list is tiny (a handful of numbers per
 * instance), so the per-message cost is negligible.
 */

/**
 * Reduces a phone number to digits only, so senders match the allowlist
 * regardless of '+', spaces, or other formatting. WhatsApp delivers `from`
 * as a bare international number (e.g. '573001112233').
 */
function normalize(value) {
  if (!value) return '';
  return String(value).replace(/\D/g, '');
}

/**
 * Returns true only when `from` matches an entry in AUTHORIZED_NUMBERS.
 * Fails closed: an empty or unset list authorizes no one.
 */
function isAuthorized(from) {
  const normalizedFrom = normalize(from);
  if (!normalizedFrom) return false;

  const allowed = (process.env.AUTHORIZED_NUMBERS ?? '')
    .split(',')
    .map(normalize)
    .filter(Boolean);

  return allowed.includes(normalizedFrom);
}

module.exports = { normalize, isAuthorized };
