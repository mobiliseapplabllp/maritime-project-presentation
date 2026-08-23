/* Incident management — HSE/marine case files with a guarded lifecycle,
 * communications thread, documents, response tasks, RCA and dashboards. */
const { Incident, Vessel, Berth, Notification } = require('../models');
const { INCIDENT_TRANSITIONS } = require('../config/constants');
const { ApiError, ok, created } = require('../utils/respond');
const { parseQuery, searchFilter } = require('../utils/paginate');
const { audit } = require('../utils/audit');
const { nextNumber } = require('../utils/numbering');

const H = 3600 * 1000;

exports.list = async (req, res) => {
  const { page, limit, skip, sort } = parseQuery(req.query, { defaultSort: '-reportedAt' });
  const filter = {};
  for (const f of ['status', 'type', 'severity', 'category', 'priority']) if (req.query[f]) filter[f] = req.query[f];
  if (req.query.open === 'true') filter.status = { $in: ['OPEN', 'ACKNOWLEDGED', 'RESPONDING', 'MONITORING'] };
  if (req.query.vessel) filter.vessel = req.query.vessel;
  const search = searchFilter(req.query.q, ['number', 'title', 'vesselName', 'reportedBy']);
  if (search) Object.assign(filter, search);
  const [items, total] = await Promise.all([
    Incident.find(filter).sort(sort).skip(skip).limit(limit)
      .select('-comms -documents -log -statusHistory -tasks')
      .populate('vessel', 'name imo').populate('berth', 'code terminal'),
    Incident.countDocuments(filter),
  ]);
  ok(res, items, { total, page, limit });
};

exports.get = async (req, res) => {
  const doc = await Incident.findById(req.params.id)
    .populate('vessel', 'name imo type flag').populate('berth', 'code name terminal');
  if (!doc) throw new ApiError(404, 'Incident not found');
  ok(res, doc);
};

exports.create = async (req, res) => {
  const b = req.body || {};
  if (!b.type || !b.title) throw new ApiError(400, 'Incident type and title are required');
  if (b.vessel && !(await Vessel.findById(b.vessel))) throw new ApiError(400, 'Vessel not found');
  if (b.berth && !(await Berth.findById(b.berth))) throw new ApiError(400, 'Berth not found');
  const now = new Date();
  const doc = await Incident.create({
    number: await nextNumber(Incident, 'number', `INC-${now.getFullYear()}-`, 4),
    category: b.category || 'MARINE', type: b.type,
    severity: b.severity || 'MEDIUM', priority: b.priority || 'P3',
    title: b.title, description: b.description || '',
    vessel: b.vessel || undefined, vesselName: b.vesselName || '', berth: b.berth || undefined,
    location: b.location || {}, reportedAt: b.reportedAt || now,
    reportedBy: b.reportedBy || req.user.name, source: b.source || 'PORTAL',
    assignedTo: b.assignedTo || { userId: String(req.user.id), name: req.user.name },
    assets: b.assets || [], injuries: b.injuries || 0, pollutionTier: b.pollutionTier || 0,
    statusHistory: [{ from: '', to: 'OPEN', at: now, by: req.user.name, note: 'Incident logged' }],
    log: [{ at: now, by: req.user.name, entry: 'Incident logged in the portal' }],
  });
  if (['HIGH', 'CRITICAL'].includes(doc.severity)) {
    Notification.create({
      title: `${doc.severity} incident — ${doc.type.replace(/_/g, ' ')}`,
      body: `${doc.number}: ${doc.title}`,
      severity: 'error', link: `/incidents/${doc._id}`, audiencePerm: 'incidents.view',
    }).catch(() => {});
  }
  audit(req, { action: 'CREATE', entity: 'Incident', entityId: doc._id, entityLabel: doc.number, after: doc });
  created(res, doc);
};

exports.update = async (req, res) => {
  const doc = await Incident.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Incident not found');
  if (doc.status === 'CLOSED') throw new ApiError(400, 'A closed incident is read-only — reopen it first');
  const before = doc.toObject();
  for (const f of ['category', 'type', 'severity', 'priority', 'title', 'description', 'vesselName',
    'location', 'reportedBy', 'source', 'assignedTo', 'assets', 'injuries', 'pollutionTier', 'weather', 'rca']) {
    if (req.body[f] !== undefined) doc[f] = req.body[f];
  }
  if (req.body.vessel !== undefined) doc.vessel = req.body.vessel || undefined;
  if (req.body.berth !== undefined) doc.berth = req.body.berth || undefined;
  await doc.save();
  audit(req, { action: 'UPDATE', entity: 'Incident', entityId: doc._id, entityLabel: doc.number, before, after: doc });
  ok(res, doc);
};

exports.transition = async (req, res) => {
  const doc = await Incident.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Incident not found');
  const { to, note } = req.body || {};
  const allowed = INCIDENT_TRANSITIONS[doc.status] || [];
  if (!allowed.includes(to)) {
    throw new ApiError(409, `Cannot move ${doc.number} from ${doc.status} to ${to}. Allowed: ${allowed.join(', ') || 'none'}`);
  }
  if (to === 'RESOLVED' && !note && !doc.outcome) throw new ApiError(400, 'A resolution summary is required');
  const now = new Date();
  const from = doc.status;
  doc.status = to;
  if (to === 'ACKNOWLEDGED') doc.acknowledgedAt = now;
  if (to === 'RESOLVED') { doc.resolvedAt = now; if (note) doc.outcome = note; }
  if (to === 'CLOSED') doc.closedAt = now;
  if (from === 'RESOLVED' || from === 'CLOSED') { doc.resolvedAt = undefined; doc.closedAt = undefined; } // reopened
  doc.statusHistory.push({ from, to, at: now, by: req.user.name, note: note || '' });
  doc.log.push({ at: now, by: req.user.name, entry: `Status ${from} → ${to}${note ? `: ${note}` : ''}` });
  await doc.save();
  audit(req, { action: 'TRANSITION', entity: 'Incident', entityId: doc._id, entityLabel: `${doc.number}: ${from} -> ${to}` });
  ok(res, doc);
};

const pushSub = (field, buildEntry, label) => async (req, res) => {
  const doc = await Incident.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Incident not found');
  if (doc.status === 'CLOSED' && field !== 'comms') throw new ApiError(400, 'A closed incident is read-only — reopen it first');
  const entry = buildEntry(req);
  doc[field].push(entry);
  await doc.save();
  audit(req, { action: label, entity: 'Incident', entityId: doc._id, entityLabel: doc.number });
  ok(res, doc);
};

exports.addComm = pushSub('comms', (req) => {
  const { channel, direction, message } = req.body || {};
  if (!message) throw new ApiError(400, 'Message text is required');
  return { at: new Date(), by: req.user.name, channel: channel || 'PORTAL', direction: direction || 'INTERNAL', message };
}, 'COMM_ADD');

exports.addDocument = pushSub('documents', (req) => {
  const { name, docType, sizeKB, note } = req.body || {};
  if (!name) throw new ApiError(400, 'Document name is required');
  return { name, docType: docType || 'OTHER', sizeKB: sizeKB || 0, uploadedBy: req.user.name, at: new Date(), note: note || '' };
}, 'DOC_ADD');

exports.addTask = pushSub('tasks', (req) => {
  const { title, assignee, due } = req.body || {};
  if (!title) throw new ApiError(400, 'Task title is required');
  return { title, assignee: assignee || '', due: due || undefined, status: 'OPEN' };
}, 'TASK_ADD');

exports.setTask = async (req, res) => {
  const doc = await Incident.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Incident not found');
  const task = doc.tasks.id(req.params.taskId);
  if (!task) throw new ApiError(404, 'Task not found');
  const { status } = req.body || {};
  if (status && ['OPEN', 'DONE'].includes(status)) {
    task.status = status;
    task.doneAt = status === 'DONE' ? new Date() : undefined;
  }
  await doc.save();
  audit(req, { action: 'TASK_UPDATE', entity: 'Incident', entityId: doc._id, entityLabel: `${doc.number} · ${task.title}` });
  ok(res, doc);
};

exports.addLog = pushSub('log', (req) => {
  const { entry } = req.body || {};
  if (!entry) throw new ApiError(400, 'Log entry text is required');
  return { at: new Date(), by: req.user.name, entry };
}, 'LOG_ADD');

exports.remove = async (req, res) => {
  const doc = await Incident.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Incident not found');
  if (doc.status !== 'OPEN') throw new ApiError(400, 'Only an OPEN incident that was logged in error can be deleted');
  await doc.deleteOne();
  audit(req, { action: 'DELETE', entity: 'Incident', entityId: doc._id, entityLabel: doc.number, before: doc });
  ok(res, { deleted: true });
};

exports.dashboard = async (req, res) => {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const all = await Incident.find({ reportedAt: { $gte: from } })
    .select('category type severity status reportedAt acknowledgedAt resolvedAt closedAt assignedTo injuries pollutionTier').lean();
  const everOpen = await Incident.find({ status: { $in: ['OPEN', 'ACKNOWLEDGED', 'RESPONDING', 'MONITORING'] } })
    .select('number title severity status reportedAt assignedTo priority').sort({ reportedAt: 1 }).lean();

  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const months = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= now) {
    months.push({ key: monthKey(cur), month: cur.toLocaleString('en-IN', { month: 'short', year: '2-digit' }), LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, total: 0 });
    cur.setMonth(cur.getMonth() + 1);
  }
  const byType = {}; const byCategory = {}; const byStatus = {};
  let resolvedN = 0; let resolveSum = 0; let ackN = 0; let ackSum = 0; let injuries = 0;
  for (const i of all) {
    const row = months.find((m) => m.key === monthKey(new Date(i.reportedAt)));
    if (row) { row[i.severity] += 1; row.total += 1; }
    byType[i.type] = (byType[i.type] || 0) + 1;
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    byStatus[i.status] = (byStatus[i.status] || 0) + 1;
    injuries += i.injuries || 0;
    const end = i.resolvedAt || i.closedAt;
    if (end) { resolvedN += 1; resolveSum += (new Date(end) - new Date(i.reportedAt)) / H; }
    if (i.acknowledgedAt) { ackN += 1; ackSum += (new Date(i.acknowledgedAt) - new Date(i.reportedAt)) / H; }
  }
  const aging = { '0-24h': 0, '1-3d': 0, '3-7d': 0, '>7d': 0 };
  for (const i of everOpen) {
    const ageH = (now - new Date(i.reportedAt)) / H;
    if (ageH <= 24) aging['0-24h'] += 1;
    else if (ageH <= 72) aging['1-3d'] += 1;
    else if (ageH <= 168) aging['3-7d'] += 1;
    else aging['>7d'] += 1;
  }
  const sla = require('../config/settingsCache').moduleGet('incidents');
  ok(res, {
    sla: { mttaTargetMin: sla.mttaTargetMin, mttrTargetHrs: sla.mttrTargetHrs },
    kpis: {
      open: everOpen.length,
      highOpen: everOpen.filter((i) => ['HIGH', 'CRITICAL'].includes(i.severity)).length,
      loggedYtd: all.filter((i) => new Date(i.reportedAt) >= yearStart).length,
      closedYtd: all.filter((i) => i.closedAt && new Date(i.closedAt) >= yearStart).length,
      mttrHrs: resolvedN ? Math.round((resolveSum / resolvedN) * 10) / 10 : 0,
      mttaMin: ackN ? Math.round((ackSum / ackN) * 60) : 0,
      injuriesYtd: injuries,
    },
    byMonth: months.map(({ key, ...m }) => m),
    byType: Object.entries(byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    byCategory: Object.entries(byCategory).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
    aging: Object.entries(aging).map(([bucket, count]) => ({ bucket, count })),
    openList: everOpen.slice(0, 12),
  });
};
