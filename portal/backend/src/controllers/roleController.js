const Role = require('../models/Role');
const User = require('../models/User');
const { ALL_PERMISSIONS } = require('../config/constants');
const { ApiError, ok, created } = require('../utils/respond');
const { audit } = require('../utils/audit');

const validPerms = (perms) => {
  if (!Array.isArray(perms)) throw new ApiError(400, 'permissions must be an array');
  const bad = perms.filter((p) => p !== '*' && !ALL_PERMISSIONS.includes(p));
  if (bad.length) throw new ApiError(400, `Unknown permissions: ${bad.join(', ')}`);
  return perms;
};

exports.list = async (_req, res) => {
  const roles = await Role.find().sort('name').lean();
  const counts = await User.find().select('role').lean();
  const byRole = counts.reduce((m, u) => { const k = String(u.role); m[k] = (m[k] || 0) + 1; return m; }, {});
  ok(res, roles.map((r) => ({ ...r, userCount: byRole[String(r._id)] || 0 })));
};

exports.create = async (req, res) => {
  const { name, description, permissions } = req.body || {};
  if (!name) throw new ApiError(400, 'Role name is required');
  const role = await Role.create({ name, description: description || '', permissions: validPerms(permissions || []) });
  audit(req, { action: 'CREATE', entity: 'Role', entityId: role._id, entityLabel: role.name, after: role });
  created(res, role);
};

exports.update = async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw new ApiError(404, 'Role not found');
  if (role.permissions.includes('*')) throw new ApiError(400, 'The Super Admin role cannot be modified');
  const before = role.toObject();
  const { name, description, permissions } = req.body || {};
  if (name !== undefined && role.system && name !== role.name) throw new ApiError(400, 'System roles cannot be renamed');
  if (name !== undefined) role.name = name;
  if (description !== undefined) role.description = description;
  if (permissions !== undefined) role.permissions = validPerms(permissions);
  await role.save();
  audit(req, { action: 'UPDATE', entity: 'Role', entityId: role._id, entityLabel: role.name, before, after: role });
  ok(res, role);
};

exports.remove = async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw new ApiError(404, 'Role not found');
  if (role.system) throw new ApiError(400, 'System roles cannot be deleted');
  const inUse = await User.countDocuments({ role: role._id });
  if (inUse) throw new ApiError(400, `${inUse} user(s) still have this role — reassign them first`);
  await role.deleteOne();
  audit(req, { action: 'DELETE', entity: 'Role', entityId: role._id, entityLabel: role.name, before: role });
  ok(res, { deleted: true });
};
