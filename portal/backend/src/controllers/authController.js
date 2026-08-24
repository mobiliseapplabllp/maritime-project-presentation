const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const settings = require('../config/settingsCache');
const { ApiError, ok } = require('../utils/respond');
const { audit } = require('../utils/audit');

// pre-computed hash of an unguessable value — burned on unknown accounts so a
// missing user costs the same time as a wrong password (no account oracle)
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10);

// Session length follows the admin module settings (sessionTimeoutMin);
// the env var is the fallback when settings are not initialised (tests).
const accessExpiry = () => {
  const min = settings.isReady() && settings.moduleGet('admin').sessionTimeoutMin;
  return min ? `${min}m` : (process.env.JWT_EXPIRES_IN || '12h');
};
const passwordMin = () => (settings.isReady() && settings.moduleGet('admin').passwordMinLength) || 8;

const signAccess = (user) => jwt.sign(
  { sub: String(user._id), name: user.name },
  process.env.JWT_SECRET, { expiresIn: accessExpiry() });
const signRefresh = (user) => jwt.sign(
  { sub: String(user._id), typ: 'refresh' },
  process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });

const sessionPayload = (user) => ({
  user: {
    ...user.toSafe(),
    role: user.role ? { _id: user.role._id, name: user.role.name } : null,
    perms: user.role ? user.role.permissions : [],
  },
  token: signAccess(user),
  refreshToken: signRefresh(user),
});

// naive in-memory throttle: 10 failed attempts per identity per 15 minutes
const attempts = new Map();
const throttled = (key) => {
  const a = attempts.get(key);
  return a && a.count >= 10 && Date.now() - a.first < 15 * 60 * 1000;
};
const recordFail = (key) => {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > 15 * 60 * 1000) attempts.set(key, { count: 1, first: Date.now() });
  else a.count += 1;
};

exports.login = async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw new ApiError(400, 'Email and password are required');
  const key = String(email).toLowerCase().trim();
  if (throttled(key)) throw new ApiError(429, 'Too many failed attempts — try again in 15 minutes');
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).populate('role');
  const passwordOk = await bcrypt.compare(String(password), user ? user.passwordHash : DUMMY_HASH);
  if (!user || !passwordOk) {
    recordFail(key);
    throw new ApiError(401, 'Incorrect email or password');
  }
  attempts.delete(key);
  if (!user.active) throw new ApiError(403, 'This account has been deactivated — contact your administrator');
  user.lastLoginAt = new Date();
  await user.save();
  req.user = { id: user._id, name: user.name, email: user.email };
  audit(req, { action: 'LOGIN', entity: 'User', entityId: user._id, entityLabel: user.email });
  ok(res, sessionPayload(user));
};

exports.refresh = async (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) throw new ApiError(400, 'Refresh token is required');
  let payload;
  try { payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET); }
  catch { throw new ApiError(401, 'Session expired — please sign in again'); }
  if (payload.typ !== 'refresh') throw new ApiError(401, 'Invalid token type');
  const user = await User.findById(payload.sub).populate('role');
  if (!user || !user.active) throw new ApiError(401, 'Account is inactive');
  ok(res, sessionPayload(user));
};

exports.me = async (req, res) => {
  const user = await User.findById(req.user.id).populate('role');
  ok(res, {
    ...user.toSafe(),
    role: user.role ? { _id: user.role._id, name: user.role.name } : null,
    perms: user.role ? user.role.permissions : [],
  });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) throw new ApiError(400, 'Current and new password are required');
  if (String(newPassword).length < passwordMin()) throw new ApiError(400, `New password must be at least ${passwordMin()} characters`);
  const user = await User.findById(req.user.id);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ApiError(400, 'Current password is incorrect');
  }
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  audit(req, { action: 'PASSWORD_CHANGE', entity: 'User', entityId: user._id, entityLabel: user.email });
  ok(res, { changed: true });
};
