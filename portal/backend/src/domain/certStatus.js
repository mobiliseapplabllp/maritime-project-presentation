const { CERT_EXPIRING_DAYS } = require('../config/constants');
const DAY = 24 * 60 * 60 * 1000;

// EXPIRED strictly before "now" (a cert expiring today is still usable today -> EXPIRING)
function certStatus(expiryDate, now = new Date()) {
  const exp = new Date(expiryDate).getTime();
  const t = now.getTime();
  if (exp < t) return 'EXPIRED';
  if (exp <= t + CERT_EXPIRING_DAYS * DAY) return 'EXPIRING';
  return 'VALID';
}

module.exports = { certStatus };
