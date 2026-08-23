const { AuditLog, Notification, Setting } = require('../models');
const { PERMISSION_GROUPS, PORTCALL_STATUS, PORTCALL_TRANSITIONS, INSPECTION_TYPES, INSPECTION_RESULTS, INVOICE_STATUS, LOOKUP_CATEGORIES, GST_RATE, SEAFARER_RANKS, SEAFARER_CERT_TYPES, INSTRUMENT_TYPES, INSTRUMENT_STATUS, LICENSE_TYPES, LICENSE_STATUS, LICENSE_TRANSITIONS, INCIDENT_TYPES, INCIDENT_STATUS, INCIDENT_SEVERITY, INCIDENT_CATEGORIES, INCIDENT_PRIORITIES, INCIDENT_SOURCES, INCIDENT_TRANSITIONS, RESOURCE_TYPES } = require('../config/constants');
const { ok } = require('../utils/respond');
const { parseQuery, searchFilter } = require('../utils/paginate');
const { audit } = require('../utils/audit');
const { ApiError } = require('../utils/respond');
const { hasPerm } = require('../domain/rbac');

exports.meta = async (_req, res) => {
  const org = await Setting.findOne({ key: 'org' }).lean();
  ok(res, {
    org: (org && org.value) || {},
    permissionGroups: PERMISSION_GROUPS,
    portCallStatuses: PORTCALL_STATUS,
    portCallTransitions: PORTCALL_TRANSITIONS,
    inspectionTypes: INSPECTION_TYPES,
    inspectionResults: INSPECTION_RESULTS,
    invoiceStatuses: INVOICE_STATUS,
    lookupCategories: LOOKUP_CATEGORIES,
    gstRate: GST_RATE,
    seafarerRanks: SEAFARER_RANKS, seafarerCertTypes: SEAFARER_CERT_TYPES,
    instrumentTypes: INSTRUMENT_TYPES, instrumentStatus: INSTRUMENT_STATUS,
    licenseTypes: LICENSE_TYPES, licenseStatus: LICENSE_STATUS, licenseTransitions: LICENSE_TRANSITIONS,
    incidentTypes: INCIDENT_TYPES, incidentStatus: INCIDENT_STATUS, incidentSeverity: INCIDENT_SEVERITY,
    incidentCategories: INCIDENT_CATEGORIES, incidentPriorities: INCIDENT_PRIORITIES, incidentSources: INCIDENT_SOURCES,
    incidentTransitions: INCIDENT_TRANSITIONS, resourceTypes: RESOURCE_TYPES,
  });
};

exports.auditList = async (req, res) => {
  const { page, limit, skip } = parseQuery(req.query, { defaultSort: '-at' });
  const filter = {};
  if (req.query.entity) filter.entity = req.query.entity;
  if (req.query.action) filter.action = req.query.action;
  if (req.query.from || req.query.to) {
    filter.at = {};
    if (req.query.from) filter.at.$gte = new Date(req.query.from);
    if (req.query.to) filter.at.$lte = new Date(req.query.to + 'T23:59:59');
  }
  const search = searchFilter(req.query.q, ['entityLabel', 'actor.email', 'actor.name']);
  if (search) Object.assign(filter, search);
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  ok(res, items, { total, page, limit });
};

exports.notifications = async (req, res) => {
  const filter = req.user.perms.includes('*') ? {} : { audiencePerm: { $in: req.user.perms } };
  const items = await Notification.find(filter).sort({ createdAt: -1 }).limit(30).lean();
  const uid = String(req.user.id);
  ok(res, items.map((n) => ({ ...n, read: (n.readBy || []).includes(uid) })), {
    unread: items.filter((n) => !(n.readBy || []).includes(uid)).length,
  });
};

exports.markRead = async (req, res) => {
  await Notification.updateOne({ _id: req.params.id }, { $addToSet: { readBy: String(req.user.id) } });
  ok(res, { read: true });
};

exports.markAllRead = async (req, res) => {
  const filter = req.user.perms.includes('*') ? {} : { audiencePerm: { $in: req.user.perms } };
  const items = await Notification.find(filter).select('_id').lean();
  await Notification.updateMany({ _id: { $in: items.map((i) => i._id) } }, { $addToSet: { readBy: String(req.user.id) } });
  ok(res, { read: items.length });
};

exports.getSettings = async (_req, res) => {
  const doc = await Setting.findOne({ key: 'org' }).lean();
  ok(res, (doc && doc.value) || {});
};

exports.updateSettings = async (req, res) => {
  const allowed = ['portName', 'operator', 'unlocode', 'address', 'gstin', 'currency', 'timezone', 'contactEmail', 'contactPhone'];
  const value = Object.fromEntries(Object.entries(req.body || {}).filter(([k]) => allowed.includes(k)));
  if (!Object.keys(value).length) throw new ApiError(400, 'Nothing to update');
  const before = await Setting.findOne({ key: 'org' }).lean();
  const doc = await Setting.findOneAndUpdate(
    { key: 'org' },
    { $set: Object.fromEntries(Object.entries(value).map(([k, v]) => [`value.${k}`, v])) },
    { new: true, upsert: true });
  audit(req, { action: 'UPDATE', entity: 'Setting', entityId: 'org', entityLabel: 'Organisation profile', before: before && before.value, after: doc.value });
  ok(res, doc.value);
};

exports.health = async (_req, res) => ok(res, { status: 'ok', time: new Date().toISOString() });
