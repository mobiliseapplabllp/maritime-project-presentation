const { Inspection, Vessel, ChecklistTemplate, Notification } = require('../models');
const { ApiError, ok, created } = require('../utils/respond');
const { parseQuery, searchFilter } = require('../utils/paginate');
const { audit } = require('../utils/audit');
const { nextNumber } = require('../utils/numbering');

exports.list = async (req, res) => {
  const { page, limit, skip, sort } = parseQuery(req.query, { defaultSort: '-plannedAt' });
  const filter = {};
  for (const f of ['status', 'type', 'vessel', 'result']) if (req.query[f]) filter[f] = req.query[f];
  if (req.query.detention === 'true') filter.detention = true;
  const search = searchFilter(req.query.q, ['number', 'inspector']);
  if (search) Object.assign(filter, search);
  const [items, total] = await Promise.all([
    Inspection.find(filter).sort(sort).skip(skip).limit(limit).populate('vessel', 'name imo flag'),
    Inspection.countDocuments(filter),
  ]);
  ok(res, items, { total, page, limit });
};

exports.get = async (req, res) => {
  const doc = await Inspection.findById(req.params.id)
    .populate('vessel', 'name imo flag type').populate('portCall', 'vcn berth status');
  if (!doc) throw new ApiError(404, 'Inspection not found');
  ok(res, doc);
};

exports.create = async (req, res) => {
  const { vessel, portCall, type, inspector, plannedAt, templateId, remarks } = req.body || {};
  if (!vessel || !type || !inspector || !plannedAt) {
    throw new ApiError(400, 'Vessel, type, inspector and planned date are required');
  }
  if (!(await Vessel.findById(vessel))) throw new ApiError(400, 'Vessel not found');
  let checklist = [];
  if (templateId) {
    const tpl = await ChecklistTemplate.findById(templateId);
    if (!tpl) throw new ApiError(400, 'Checklist template not found');
    checklist = tpl.items.map((i) => ({ seq: i.seq, text: i.text, category: i.category, answer: '', note: '' }));
  }
  const doc = await Inspection.create({
    number: await nextNumber(Inspection, 'number', `INS-${new Date(plannedAt).getFullYear()}-`, 3),
    vessel, portCall: portCall || undefined, type, inspector, plannedAt, checklist, remarks: remarks || '',
  });
  audit(req, { action: 'CREATE', entity: 'Inspection', entityId: doc._id, entityLabel: doc.number, after: doc });
  created(res, doc);
};

exports.update = async (req, res) => {
  const doc = await Inspection.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Inspection not found');
  if (doc.status === 'CLOSED') throw new ApiError(400, 'A closed inspection is read-only');
  const before = doc.toObject();
  for (const f of ['inspector', 'plannedAt', 'remarks']) if (req.body[f] !== undefined) doc[f] = req.body[f];
  if (Array.isArray(req.body.checklist)) {
    doc.checklist = req.body.checklist.map((i, idx) => ({
      seq: i.seq || idx + 1, text: i.text, category: i.category || 'General',
      answer: ['YES', 'NO', 'NA', ''].includes(i.answer) ? i.answer : '', note: i.note || '',
    }));
    if (doc.status === 'PLANNED' && doc.checklist.some((i) => i.answer)) {
      doc.status = 'IN_PROGRESS';
      doc.startedAt = doc.startedAt || new Date();
    }
  }
  await doc.save();
  audit(req, { action: 'UPDATE', entity: 'Inspection', entityId: doc._id, entityLabel: doc.number, before, after: doc });
  ok(res, doc);
};

exports.start = async (req, res) => {
  const doc = await Inspection.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Inspection not found');
  if (doc.status !== 'PLANNED') throw new ApiError(409, 'Only a planned inspection can be started');
  doc.status = 'IN_PROGRESS';
  doc.startedAt = new Date();
  await doc.save();
  audit(req, { action: 'START', entity: 'Inspection', entityId: doc._id, entityLabel: doc.number });
  ok(res, doc);
};

exports.addFinding = async (req, res) => {
  const doc = await Inspection.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Inspection not found');
  if (doc.status === 'CLOSED') throw new ApiError(400, 'A closed inspection is read-only');
  const { deficiencyCode, description, actionCode, dueDate } = req.body || {};
  if (!deficiencyCode || !description) throw new ApiError(400, 'Deficiency code and description are required');
  doc.findings.push({ deficiencyCode, description, actionCode: actionCode || '', dueDate });
  if (doc.status === 'PLANNED') { doc.status = 'IN_PROGRESS'; doc.startedAt = doc.startedAt || new Date(); }
  await doc.save();
  audit(req, { action: 'FINDING_ADD', entity: 'Inspection', entityId: doc._id, entityLabel: `${doc.number} — ${deficiencyCode}` });
  created(res, doc);
};

exports.updateFinding = async (req, res) => {
  const doc = await Inspection.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Inspection not found');
  const finding = doc.findings.id(req.params.findingId);
  if (!finding) throw new ApiError(404, 'Finding not found');
  const before = finding.toObject();
  for (const f of ['deficiencyCode', 'description', 'actionCode', 'dueDate', 'status']) {
    if (req.body[f] !== undefined) finding[f] = req.body[f];
  }
  if (req.body.status === 'CLOSED' && !finding.closedAt) finding.closedAt = new Date();
  if (req.body.status === 'OPEN') finding.closedAt = undefined;
  await doc.save();
  audit(req, { action: 'FINDING_UPDATE', entity: 'Inspection', entityId: doc._id, entityLabel: `${doc.number} — ${finding.deficiencyCode}`, before, after: finding.toObject() });
  ok(res, doc);
};

exports.removeFinding = async (req, res) => {
  const doc = await Inspection.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Inspection not found');
  if (doc.status === 'CLOSED') throw new ApiError(400, 'A closed inspection is read-only');
  const finding = doc.findings.id(req.params.findingId);
  if (!finding) throw new ApiError(404, 'Finding not found');
  audit(req, { action: 'FINDING_DELETE', entity: 'Inspection', entityId: doc._id, entityLabel: `${doc.number} — ${finding.deficiencyCode}`, before: finding.toObject() });
  finding.deleteOne();
  await doc.save();
  ok(res, doc);
};

exports.close = async (req, res) => {
  const doc = await Inspection.findById(req.params.id).populate('vessel', 'name');
  if (!doc) throw new ApiError(404, 'Inspection not found');
  if (doc.status === 'CLOSED') throw new ApiError(409, 'Inspection is already closed');
  const { result, remarks } = req.body || {};
  if (!result) throw new ApiError(400, 'Select a result before closing the inspection');
  if (result === 'SATISFACTORY' && doc.findings.some((f) => f.status === 'OPEN')) {
    throw new ApiError(400, 'Cannot close as satisfactory with open findings — close or reclassify them first');
  }
  doc.result = result;
  doc.detention = result === 'DETAINED';
  doc.status = 'CLOSED';
  doc.closedAt = new Date();
  if (remarks !== undefined) doc.remarks = remarks;
  await doc.save();
  if (doc.detention) {
    Notification.create({
      title: `DETENTION — ${doc.vessel.name}`,
      body: `Inspection ${doc.number} closed as detained (${doc.findings.filter((f) => f.status === 'OPEN').length} open findings)`,
      severity: 'error', link: `/inspections/${doc._id}`, audiencePerm: 'inspections.view',
    }).catch(() => {});
  }
  audit(req, { action: 'CLOSE', entity: 'Inspection', entityId: doc._id, entityLabel: `${doc.number} — ${result}` });
  ok(res, doc);
};

exports.remove = async (req, res) => {
  const doc = await Inspection.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Inspection not found');
  if (doc.status !== 'PLANNED') throw new ApiError(400, 'Only planned inspections can be deleted');
  await doc.deleteOne();
  audit(req, { action: 'DELETE', entity: 'Inspection', entityId: doc._id, entityLabel: doc.number, before: doc });
  ok(res, { deleted: true });
};
