/* A2 — the service-request front door.
 *
 * One engine for every regulatory service the authority offers. A definition
 * describes the service; a request is one application against it. Approval
 * hands off to the A1 licensing engine to produce the instrument, so the
 * decision and the certificate are never separately maintained. */
const { ServiceDefinition, ServiceRequest, License, Notification } = require('../models');
const { REQUEST_TRANSITIONS } = require('../config/constants');
const { ApiError, ok, created } = require('../utils/respond');
const { parseQuery, searchFilter } = require('../utils/paginate');
const { audit } = require('../utils/audit');
const { hasPerm } = require('../domain/rbac');
const { nextNumber } = require('../utils/numbering');
const S = require('../domain/licenceSubjects');
const { finaliseIssue } = require('../domain/instrumentIssue');

const D = 86400000;

/* ------------------------------------------------------------- catalogue --- */

exports.listDefinitions = async (req, res) => {
  const filter = {};
  if (req.query.domain) filter.domain = Number(req.query.domain);
  if (req.query.subjectKind) filter.subjectKind = req.query.subjectKind;
  if (req.query.active !== 'false') filter.active = true;
  const search = searchFilter(req.query.q, ['code', 'name', 'description']);
  if (search) Object.assign(filter, search);
  const rows = await ServiceDefinition.find(filter).sort({ domain: 1, name: 1 }).lean();
  ok(res, rows, { total: rows.length });
};

exports.getDefinition = async (req, res) => {
  const doc = await ServiceDefinition.findOne({
    $or: [{ code: String(req.params.id).toUpperCase() }, { _id: req.params.id.match(/^[a-f0-9]{24}$/i) ? req.params.id : null }],
  }).lean();
  if (!doc) throw new ApiError(404, 'Service not found');
  ok(res, doc);
};

/** The catalogue grouped by RFP domain — what the service landing page reads. */
exports.catalogue = async (_req, res) => {
  const rows = await ServiceDefinition.find({ active: true })
    .select('code name nameLocal domain subjectKind issuesInstrument fee slaDays autoApprovable').lean();
  const byDomain = {};
  rows.forEach((r) => { (byDomain[r.domain] = byDomain[r.domain] || []).push(r); });
  ok(res, {
    total: rows.length,
    autoApprovable: rows.filter((r) => r.autoApprovable).length,
    domains: Object.keys(byDomain).sort().map((d) => ({ domain: Number(d), services: byDomain[d] })),
  });
};

exports.upsertDefinition = async (req, res) => {
  const b = req.body || {};
  if (!b.code || !b.name || !b.domain || !b.subjectKind) {
    throw new ApiError(400, 'Code, name, domain and subject kind are required');
  }
  const existing = await ServiceDefinition.findOne({ code: String(b.code).toUpperCase() });
  if (existing) {
    Object.assign(existing, b, { code: String(b.code).toUpperCase(), version: existing.version + 1 });
    await existing.save();
    audit(req, { action: 'UPDATE', entity: 'ServiceDefinition', entityId: existing._id, entityLabel: existing.code });
    return ok(res, existing);
  }
  const doc = await ServiceDefinition.create({ ...b, code: String(b.code).toUpperCase() });
  audit(req, { action: 'CREATE', entity: 'ServiceDefinition', entityId: doc._id, entityLabel: doc.code });
  return created(res, doc);
};

/* -------------------------------------------------------------- requests --- */

exports.list = async (req, res) => {
  const { page, limit, skip, sort } = parseQuery(req.query, { defaultSort: '-createdAt' });
  const filter = {};
  for (const f of ['status', 'serviceCode', 'subjectKind', 'assignedTo']) {
    if (req.query[f]) filter[f] = req.query[f];
  }
  if (req.query.domain) filter.domain = Number(req.query.domain);
  // Object-level authorization: a caller who cannot assess (an applicant role)
  // only ever sees their own applications, regardless of the mine param. Staff
  // assessors may list across applicants and may opt into mine=true.
  const canAssess = hasPerm(req.user.perms, 'services.assess');
  if (!canAssess || req.query.mine === 'true') {
    filter['applicant.userId'] = String(req.user.id);
  }
  if (req.query.open === 'true') filter.status = { $in: ['SUBMITTED', 'UNDER_ASSESSMENT', 'INFO_REQUESTED'] };
  if (req.query.breached === 'true') { filter.closedAt = null; filter.dueAt = { $lt: new Date() }; }
  const search = searchFilter(req.query.q, ['requestNo', 'applicant.name', 'subjectLabel', 'serviceName']);
  if (search) Object.assign(filter, search);
  const [rows, total] = await Promise.all([
    ServiceRequest.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    ServiceRequest.countDocuments(filter),
  ]);
  // virtuals do not survive .lean() — derive the SLA fact here
  const now = new Date();
  const items = rows.map((r) => ({ ...r, slaBreached: !!(r.dueAt && !r.closedAt && new Date(r.dueAt) < now) }));
  ok(res, items, { total, page, limit });
};

exports.get = async (req, res) => {
  const doc = await ServiceRequest.findById(req.params.id).populate('service').lean();
  if (!doc) throw new ApiError(404, 'Request not found');
  // Direct-object-reference guard: an applicant may only read their own request.
  const canAssess = hasPerm(req.user.perms, 'services.assess');
  if (!canAssess && String(doc.applicant?.userId) !== String(req.user.id)) {
    throw new ApiError(404, 'Request not found');
  }
  doc.slaBreached = !!(doc.dueAt && !doc.closedAt && new Date(doc.dueAt) < new Date());
  ok(res, doc);
};

/** Lodge an application. Validates against the definition, not against code. */
exports.submit = async (req, res) => {
  const b = req.body || {};
  const def = await ServiceDefinition.findOne({ code: String(b.serviceCode || '').toUpperCase(), active: true }).lean();
  if (!def) throw new ApiError(404, 'No active service found for that code');

  // required form fields, as the definition declares them
  const missing = (def.formFields || []).filter((f) => f.required
    && (b.formData || {})[f.key] === undefined).map((f) => f.label);
  if (missing.length) throw new ApiError(400, `Required information missing: ${missing.join(', ')}`);

  let subjectLabel = b.subjectLabel || '';
  if (def.subjectRequired) {
    if (!b.subjectRef) throw new ApiError(400, `This service must be lodged against a ${def.subjectKind.replace(/_/g, ' ').toLowerCase()}`);
    const subject = await S.resolveSubject(def.subjectKind, b.subjectRef);
    if (!subject) throw new ApiError(404, `No ${def.subjectKind.replace(/_/g, ' ').toLowerCase()} found for this application`);
    subjectLabel = S.labelFor(def.subjectKind, subject);
  }

  const now = new Date();
  const isDraft = b.draft === true;
  const doc = await ServiceRequest.create({
    requestNo: await nextNumber(ServiceRequest, 'requestNo', `SR-${now.getFullYear()}-`, 5),
    service: def._id, serviceCode: def.code, serviceName: def.name, domain: def.domain,
    applicant: {
      userId: String(req.user.id), name: b.applicantName || req.user.name,
      email: b.applicantEmail || req.user.email || '', phone: b.applicantPhone || '',
      organisation: b.organisation || '',
    },
    subjectKind: def.subjectKind,
    subjectRef: b.subjectRef || undefined,
    subjectModel: b.subjectRef ? S.MODEL_NAME_BY_KIND[def.subjectKind] : undefined,
    subjectLabel,
    formData: b.formData || {},
    documents: (b.documents || []).map((d) => ({ key: d.key, label: d.label || '', fileName: d.fileName || '' })),
    status: isDraft ? 'DRAFT' : 'SUBMITTED',
    currentStage: (def.stages || [])[0] ? def.stages[0].key : '',
    fee: { amount: def.fee?.amount || 0, currency: def.fee?.currency || 'INR' },
    submittedAt: isDraft ? undefined : now,
    dueAt: isDraft ? undefined : new Date(now.getTime() + (def.slaDays || 10) * D),
    history: [{ from: '', to: isDraft ? 'DRAFT' : 'SUBMITTED', at: now, by: req.user.name, note: 'Application lodged' }],
  });
  audit(req, { action: 'CREATE', entity: 'ServiceRequest', entityId: doc._id, entityLabel: `${doc.requestNo} — ${def.name}` });
  created(res, doc);
};

/** Move a request through its lifecycle. Approval runs the eligibility checks. */
exports.transition = async (req, res) => {
  const doc = await ServiceRequest.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Request not found');
  const { to, note } = req.body || {};
  const allowed = REQUEST_TRANSITIONS[doc.status] || [];
  if (!allowed.includes(to)) {
    throw new ApiError(409, `A ${doc.status.replace(/_/g, ' ').toLowerCase()} request cannot move to ${String(to || '').replace(/_/g, ' ').toLowerCase()}`);
  }
  if (['REJECTED', 'INFO_REQUESTED'].includes(to) && !note) {
    throw new ApiError(400, 'A reason is required for this action');
  }

  const from = doc.status;
  const now = new Date();

  if (to === 'APPROVED') {
    const checks = await S.runIssueChecks(doc.subjectKind, doc.subjectRef);
    const blocked = S.blockingFailures(checks);
    if (blocked.length && !req.body.override) {
      throw new ApiError(409, `Cannot approve — ${blocked.map((c) => c.detail).join('; ')}`);
    }
    doc.checks = checks.map(({ check, passed, detail }) => ({ check, passed, detail }));
    doc.decision = { outcome: 'APPROVED', by: req.user.name, at: now, reason: note || '', automated: false };
  }
  if (to === 'REJECTED') {
    doc.decision = { outcome: 'REJECTED', by: req.user.name, at: now, reason: note, automated: false };
    doc.closedAt = now;
  }
  if (to === 'SUBMITTED' && !doc.submittedAt) {
    const def = await ServiceDefinition.findById(doc.service).select('slaDays').lean();
    doc.submittedAt = now;
    doc.dueAt = new Date(now.getTime() + ((def && def.slaDays) || 10) * D);
  }
  if (to === 'WITHDRAWN') doc.closedAt = now;

  doc.status = to;
  doc.history.push({ from, to, at: now, by: req.user.name, note: note || '' });
  await doc.save();
  audit(req, { action: 'TRANSITION', entity: 'ServiceRequest', entityId: doc._id, entityLabel: `${doc.requestNo}: ${from} → ${to}` });
  ok(res, doc);
};

/** Issue the instrument for an approved request, through the A1 engine. */
exports.issue = async (req, res) => {
  const doc = await ServiceRequest.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Request not found');
  if (doc.status !== 'APPROVED') throw new ApiError(409, 'Only an approved request can be issued');
  const def = await ServiceDefinition.findById(doc.service).lean();
  if (!def || !def.issuesInstrument) throw new ApiError(400, 'This service does not issue an instrument');

  const entityType = def.issuesInstrument;
  const now = new Date();
  const months = S.validityMonthsFor(entityType);
  const lic = new License({
    licenseNo: await nextNumber(License, 'licenseNo', `${S.numberPrefixFor(entityType)}-${now.getFullYear()}-`),
    subjectKind: doc.subjectKind,
    subjectRef: doc.subjectRef || undefined,
    subjectModel: doc.subjectModel,
    instrumentClass: S.instrumentClassFor(entityType),
    entityName: doc.subjectLabel || doc.applicant.name,
    entityType,
    status: 'ISSUED',
    contactPerson: doc.applicant.name,
    phone: doc.applicant.phone, email: doc.applicant.email,
    appliedDate: doc.submittedAt || doc.createdAt,
    issueDate: now,
    expiryDate: new Date(now.getTime() + months * 30.44 * D),
    issueChecks: doc.checks,
    history: [
      { from: '', to: 'APPLIED', at: doc.submittedAt || doc.createdAt, by: doc.applicant.name, note: `Via ${doc.requestNo}` },
      { from: 'APPLIED', to: 'ISSUED', at: now, by: req.user.name, note: `Issued on approval of ${doc.requestNo}` },
    ],
  });
  // B2 — the same two things happen however an instrument reaches ISSUED: it is
  // signed, and a statutory ship certificate is written onto the ship.
  await finaliseIssue(lic);
  await lic.save();

  doc.issuedInstrument = lic._id;
  doc.status = 'ISSUED';
  doc.closedAt = now;
  doc.history.push({ from: 'APPROVED', to: 'ISSUED', at: now, by: req.user.name, note: `${lic.licenseNo} issued` });
  await doc.save();

  Notification.create({
    title: `${def.name} issued — ${doc.subjectLabel || doc.applicant.name}`,
    body: `${lic.licenseNo} issued against application ${doc.requestNo}.`,
    severity: 'success', link: `/services/requests/${doc._id}`,
    audiencePerm: `${S.permBaseFor(doc.subjectKind)}.view`,
  }).catch(() => {});

  audit(req, { action: 'ISSUE', entity: 'ServiceRequest', entityId: doc._id, entityLabel: `${doc.requestNo} → ${lic.licenseNo}` });
  ok(res, { request: doc, instrument: lic });
};

/** Attach or verify a supporting document. */
exports.addDocument = async (req, res) => {
  const doc = await ServiceRequest.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Request not found');
  const { key, label, fileName } = req.body || {};
  if (!key) throw new ApiError(400, 'A document key is required');
  doc.documents.push({ key, label: label || '', fileName: fileName || '' });
  await doc.save();
  audit(req, { action: 'DOC_ADD', entity: 'ServiceRequest', entityId: doc._id, entityLabel: `${doc.requestNo} — ${key}` });
  created(res, doc);
};

exports.verifyDocument = async (req, res) => {
  const doc = await ServiceRequest.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Request not found');
  const att = doc.documents.id(req.params.docId);
  if (!att) throw new ApiError(404, 'Document not found on this request');
  att.verified = req.body.verified !== false;
  att.verifiedBy = req.user.name;
  att.verifiedAt = new Date();
  att.notes = req.body.notes || '';
  await doc.save();
  audit(req, { action: 'DOC_VERIFY', entity: 'ServiceRequest', entityId: doc._id, entityLabel: `${doc.requestNo} — ${att.key}` });
  ok(res, doc);
};

/** The service desk dashboard — volume, SLA and decision mix. */
exports.dashboard = async (_req, res) => {
  const now = new Date();
  const rows = await ServiceRequest.find().select('status domain serviceName submittedAt closedAt dueAt decision').lean();
  const open = rows.filter((r) => ['SUBMITTED', 'UNDER_ASSESSMENT', 'INFO_REQUESTED'].includes(r.status));
  const closed = rows.filter((r) => r.closedAt && r.submittedAt);
  const breached = open.filter((r) => r.dueAt && new Date(r.dueAt) < now);
  const decided = rows.filter((r) => r.decision && r.decision.outcome);
  const avgDays = closed.length
    ? Math.round((closed.reduce((s, r) => s + (new Date(r.closedAt) - new Date(r.submittedAt)), 0) / closed.length / D) * 10) / 10
    : 0;
  const byDomain = {};
  rows.forEach((r) => { byDomain[r.domain] = (byDomain[r.domain] || 0) + 1; });
  const byService = {};
  rows.forEach((r) => { byService[r.serviceName] = (byService[r.serviceName] || 0) + 1; });
  ok(res, {
    total: rows.length,
    open: open.length,
    breached: breached.length,
    slaCompliance: open.length ? Math.round(((open.length - breached.length) / open.length) * 100) : 100,
    avgDecisionDays: avgDays,
    approved: decided.filter((r) => r.decision.outcome === 'APPROVED').length,
    rejected: decided.filter((r) => r.decision.outcome === 'REJECTED').length,
    automated: decided.filter((r) => r.decision.automated).length,
    byDomain: Object.keys(byDomain).sort().map((d) => ({ domain: Number(d), count: byDomain[d] })),
    topServices: Object.entries(byService).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, count]) => ({ name, count })),
  });
};
