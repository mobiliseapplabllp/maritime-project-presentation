const { CERT_EXPIRING_DAYS } = require('../config/constants');
const { moduleGet, isReady } = require('../config/settingsCache');
const DAY = 24 * 60 * 60 * 1000;

// EXPIRED strictly before "now" (a cert expiring today is still usable today -> EXPIRING).
// The warning window is admin-controlled (Fleet Manager module settings) with the
// statutory default as fallback when the cache isn't primed (scripts, unit tests).
function certStatus(expiryDate, now = new Date()) {
  const windowDays = isReady() ? (moduleGet('ships').certExpiringDays || CERT_EXPIRING_DAYS) : CERT_EXPIRING_DAYS;
  const exp = new Date(expiryDate).getTime();
  const t = now.getTime();
  if (exp < t) return 'EXPIRED';
  if (exp <= t + windowDays * DAY) return 'EXPIRING';
  return 'VALID';
}

module.exports = { certStatus };
