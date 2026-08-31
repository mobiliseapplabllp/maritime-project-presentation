const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { hasPerm } = require('../domain/rbac');
const { ApiError } = require('../utils/respond');

// Loads the user + role fresh on every request so permission-matrix edits apply immediately.
async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'Authentication required');
    let payload;
    try { payload = jwt.verify(token, process.env.JWT_SECRET); }
    catch { throw new ApiError(401, 'Session expired — please sign in again'); }
    const user = await User.findById(payload.sub).populate('role');
    if (!user || !user.active) throw new ApiError(401, 'Account is inactive');
    req.user = {
      id: user._id, name: user.name, email: user.email,
      role: user.role ? { id: user.role._id, name: user.role.name } : null,
      perms: user.role ? user.role.permissions : [],
    };
    next();
  } catch (e) { next(e); }
}

const requirePerm = (perm) => (req, _res, next) => {
  if (!req.user) return next(new ApiError(401, 'Authentication required'));
  if (!hasPerm(req.user.perms, perm)) {
    return next(new ApiError(403, `You don't have permission to do this (${perm})`));
  }
  next();
};

module.exports = { authenticate, requirePerm };
