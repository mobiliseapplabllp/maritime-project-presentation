/* Publication governance for legislative instruments.
 *
 * Two rules, kept here as pure functions so they can be tested without a
 * database and cannot be bypassed by a different caller:
 *
 *   1. an instrument moves through its lifecycle one way only;
 *   2. the person who drafted an instrument may not be the person who puts it
 *      in force.
 *
 * The second is the maker-checker separation the RFP asks for in Domain 3. It
 * is a rule about people rather than about permissions, so holding the approve
 * permission is necessary but not sufficient — which is the whole point.
 */
const { INSTRUMENT_TRANSITIONS } = require('../config/constants');

const label = (s) => String(s || '').replace(/_/g, ' ').toLowerCase();

/** Whether an instrument may move from one status to another. */
function canTransition(from, to) {
  const allowed = INSTRUMENT_TRANSITIONS[from];
  if (!allowed) return { ok: false, error: `Unknown instrument status "${from}"` };
  if (from === to) return { ok: false, error: `The instrument is already ${label(to)}` };
  if (!allowed.includes(to)) {
    return allowed.length
      ? { ok: false, error: `A ${label(from)} instrument cannot become ${label(to)}` }
      : { ok: false, error: `A ${label(from)} instrument is final and cannot be changed` };
  }
  return { ok: true };
}

/** Whether this person may put this instrument in force. */
function canApprove(instrument, approverId) {
  const move = canTransition(instrument.status, 'IN_FORCE');
  if (!move.ok) return move;
  const drafter = String(instrument.draftedBy || '');
  if (!drafter) {
    return { ok: false, error: 'The instrument records no drafter, so separation of duties cannot be established' };
  }
  if (drafter === String(approverId)) {
    return { ok: false, error: 'An instrument cannot be approved by the person who drafted it' };
  }
  return { ok: true };
}

module.exports = { canTransition, canApprove };
