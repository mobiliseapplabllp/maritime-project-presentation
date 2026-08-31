const bcrypt = require('bcryptjs');
const settings = require('../config/settingsCache');
const passwordMin = () => (settings.isReady() && settings.moduleGet('admin').passwordMinLength) || 8;
const User = require('../models/User');
const Role = require('../models/Role');
const { ApiError, ok, created } = require('../utils/respond');
const { parseQuery, searchFilter } = require('../utils/paginate');
const { audit } = require('../utils/audit');

exports.list = async (req, res) => {
  const { page, limit, skip, sort } = parseQuery(req.query, { defaultSort: 'name' });
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.active === 'true') filter.active = true;
  if (req.query.active === 'false') filter.active = false;
  const search = searchFilter(req.query.q, ['name', 'email', 'designation']);
  if (search) Object.assign(filter, search);
  const [items, total] = await Promise.all([
    User.find(filter).populate('role', 'name').sort(sort).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  ok(res, items.map((u) => ({ ...u.toSafe(), role: u.role })), { total, page, limit });
};

exports.create = async (req, res) => {
  const { name, email, password, role, designation, department, phone } = req.body || {};
  if (!name || !email || !password || !role) throw new ApiError(400, 'Name, email, password and role are required');
  if (String(password).length < passwordMin()) throw new ApiError(400, `Password must be at least ${passwordMin()} characters`);
  if (!(await Role.findById(role))) throw new ApiError(400, 'Selected role does not exist');
  const user = await User.create({
    name, email, role, designation: designation || '', department: department || '', phone: phone || '',
    passwordHash: await bcrypt.hash(password, 10),
  });
  audit(req, { action: 'CREATE', entity: 'User', entityId: user._id, entityLabel: user.email, after: user.toSafe() });
  created(res, user.toSafe());
};

exports.update = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  const before = user.toSafe();
  const { name, email, role, designation, department, phone, active } = req.body || {};
  if (active === false && String(user._id) === String(req.user.id)) {
    throw new ApiError(400, 'You cannot deactivate your own account');
  }
  if (role && !(await Role.findById(role))) throw new ApiError(400, 'Selected role does not exist');
  Object.assign(user, {
    ...(name !== undefined && { name }), ...(email !== undefined && { email }),
    ...(role !== undefined && { role }), ...(designation !== undefined && { designation }), ...(department !== undefined && { department }),
    ...(phone !== undefined && { phone }), ...(active !== undefined && { active }),
  });
  await user.save();
  audit(req, { action: 'UPDATE', entity: 'User', entityId: user._id, entityLabel: user.email, before, after: user.toSafe() });
  ok(res, user.toSafe());
};

exports.resetPassword = async (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < passwordMin()) throw new ApiError(400, `Password must be at least ${passwordMin()} characters`);
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  user.passwordHash = await bcrypt.hash(password, 10);
  await user.save();
  audit(req, { action: 'PASSWORD_RESET', entity: 'User', entityId: user._id, entityLabel: user.email });
  ok(res, { reset: true });
};

exports.remove = async (req, res) => {
  if (String(req.params.id) === String(req.user.id)) throw new ApiError(400, 'You cannot delete your own account');
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');
  await user.deleteOne();
  audit(req, { action: 'DELETE', entity: 'User', entityId: user._id, entityLabel: user.email, before: user.toSafe() });
  ok(res, { deleted: true });
};
