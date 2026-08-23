const { Incident, Vessel, Notification } = require('../models');
const { ApiError, ok, created } = require('../utils/respond');
const { parseQuery, searchFilter } = require('../utils/paginate');
const { audit } = require('../utils/audit');
const { nextNumber } = require('../utils/numbering');

exports.list = async (req, res) => {
  const { page, limit, skip, sort } = parseQuery(req.query, { defaultSort: '-reportedAt' });
  const filter = {};
  for (const f of ['status', 'type', 'severity']) if (req.query[f]) filter[f] = req.query[f];
  const search = searchFilter(req.query.q, ['number', 'title', 'vesselName']);
  if (search) Object.assign(filter, search);
  const [items, total] = await Promise.all([
    Incident.find(filter).sort(sort).skip(skip).limit(limit).populate('vessel', 'name imo'),
    Incident.countDocuments(filter),
  ]);
  ok(res, items, { total, page, limit });
};

exports.get = async (req, res) => {
  const doc = await Incident.findById(req.params.id).populate('vessel', 'name imo type flag');
  if (!doc) throw new ApiError(404, 'Incident not found');
  ok(res, doc);
};

exports.create = async (req, res) => {
  const { type, severity, title, vessel, vesselName, position, reportedAt, reportedBy, assets } = req.body || {};
  if (!type || !title) throw new ApiError(400, 'Incident type and title are required');
  if (vessel && !(await Vessel.findById(vessel))) throw new ApiError(400, 'Vessel not found');
  const doc = await Incident.create({
    number: await nextNumber(Incident, 'number', `MRCC-${new Date().getFullYear()}-`, 3),
    type, severity: severity || 'MEDIUM', title, vessel: vessel || undefined,
    vesselName: vesselName || '', position, reportedAt: reportedAt || new Date(),
    reportedBy: reportedBy || req.user.name, assets: assets || [],
    log: [{ at: new Date(), by: req.user.name, entry: 'Incident opened' }],
  });
  if (['HIGH', 'CRITICAL'].includes(doc.severity)) {
    Notification.create({
      title: `${doc.severity} incident — ${doc.type}`,
      body: `${doc.number}: ${doc.title}`,
      severity: 'error', link: `/nmc/incidents/${doc._id}`, audiencePerm: 'nmc.view',
    }).catch(() => {});
  }
  audit(req, { action: 'CREATE', entity: 'Incident', entityId: doc._id, entityLabel: doc.number, after: doc });
  created(res, doc);
};

exports.update = async (req, res) => {
  const doc = await Incident.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Incident not found');
  if (doc.status === 'CLOSED') throw new ApiError(400, 'A closed incident is read-only');
  const before = doc.toObject();
  for (const f of ['type', 'severity', 'title', 'vesselName', 'position', 'reportedBy', 'assets']) {
    if (req.body[f] !== undefined) doc[f] = req.body[f];
  }
  if (req.body.status === 'RESPONDING' && doc.status === 'OPEN') doc.status = 'RESPONDING';
  await doc.save();
  audit(req, { action: 'UPDATE', entity: 'Incident', entityId: doc._id, entityLabel: doc.number, before, after: doc });
  ok(res, doc);
};

exports.addLog = async (req, res) => {
  const doc = await Incident.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Incident not found');
  if (doc.status === 'CLOSED') throw new ApiError(400, 'A closed incident is read-only');
  const { entry } = req.body || {};
  if (!entry) throw new ApiError(400, 'Log entry text is required');
  doc.log.push({ at: new Date(), by: req.user.name, entry });
  if (doc.status === 'OPEN') doc.status = 'RESPONDING';
  await doc.save();
  audit(req, { action: 'LOG_ADD', entity: 'Incident', entityId: doc._id, entityLabel: doc.number });
  ok(res, doc);
};

exports.close = async (req, res) => {
  const doc = await Incident.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Incident not found');
  if (doc.status === 'CLOSED') throw new ApiError(409, 'Incident is already closed');
  const { outcome } = req.body || {};
  if (!outcome) throw new ApiError(400, 'An outcome summary is required to close an incident');
  doc.status = 'CLOSED';
  doc.closedAt = new Date();
  doc.outcome = outcome;
  doc.log.push({ at: new Date(), by: req.user.name, entry: `Incident closed: ${outcome}` });
  await doc.save();
  audit(req, { action: 'CLOSE', entity: 'Incident', entityId: doc._id, entityLabel: doc.number });
  ok(res, doc);
};
