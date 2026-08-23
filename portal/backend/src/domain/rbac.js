function hasPerm(perms, needed) {
  if (!Array.isArray(perms)) return false;
  return perms.includes('*') || perms.includes(needed);
}
module.exports = { hasPerm };
