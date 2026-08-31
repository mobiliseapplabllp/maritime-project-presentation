const { PORTCALL_TRANSITIONS } = require('../config/constants');

function canTransition(from, to) {
  const allowed = PORTCALL_TRANSITIONS[from];
  if (!allowed) return { ok: false, error: `Unknown status "${from}" — cannot move` };
  if (!allowed.includes(to)) {
    return { ok: false, error: `A ${from.replace(/_/g, ' ').toLowerCase()} call cannot move to ${to.replace(/_/g, ' ').toLowerCase()}` };
  }
  return { ok: true };
}

module.exports = { canTransition };
