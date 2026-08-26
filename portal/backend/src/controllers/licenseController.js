const { makeCrud } = require('./crudFactory');
const { License, Notification } = require('../models');
const { LICENSE_TRANSITIONS } = require('../config/constants');
const { ApiError, ok, created } = require('../utils/respond');
const { audit } = require('../utils/audit');
const { nextNumber } = require('../utils/numbering');
const { hasPerm } = require('../domain/rbac');
const S = require('../domain/licenceSubjects');

// "LICENCE" reads as shouting in user-facing copy; sentence-case it.
const clsLabel = (doc) => {
  const k = doc.instrumentClass || 'LICENCE';
  return k.charAt(0) + k.slice(1).toLowerCase();
};

const base = makeCrud(License, {
  entity: 'License', labelField: 'licenseNo',
  fields: ['entityName', 'entityType', 'contactPerson', 'phone', 'email', 'address', 'gstin',
    'expiryDate', 'conditions', 'performanceRating'],
  searchFields: ['licenseNo', 'entityName'],
  filterFields: ['entityType', 'status', 'subjectKind', 'instrumentClass', 'subjectRef'],
  defaultSort: '-createdAt',
});

// A1 — an instrument is governed by the permission group of the thing it is
// issued against, so a navigation licence answers to vessels.* and a company
// accreditation to facilities.*. The route-level guard covers the default
// (facilities) case; this covers everything else.
function assertSubjectPerm(req, subjectKind, action) {
  const perm = `${S.permBaseFor(subjectKind)}.${action}`;
  const fallback = `facilities.${action}`;
  if (hasPerm(req.user.perms, perm) || hasPerm(req.user.perms, fallback)) return;
  throw new ApiError(403, `You don't have permission to do this (${perm})`);
}

module.exports = {
  ...base,
  create: async (req, res) => {
    const b = req.body || {};
    const { entityType, contactPerson, phone, email, address, gstin, conditions, subjectRef } = b;
    const subjectKind = b.subjectKind || 'COMPANY';
    if (!entityType) throw new ApiError(400, 'An instrument type is required');
    if (!S.typeAllowedFor(subjectKind, entityType)) {
      throw new ApiError(400, `${entityType.replace(/_/g, ' ').toLowerCase()} cannot be issued against a ${subjectKind.replace(/_/g, ' ').toLowerCase()}`);
    }
    assertSubjectPerm(req, subjectKind, 'manage');

    // A linked subject names the instrument; a free-text applicant may still be
    // used for a company that is not yet on the directory.
    let entityName = b.entityName;
    if (subjectRef) {
      const subject = await S.resolveSubject(subjectKind, subjectRef);
      if (!subject) throw new ApiError(404, `No ${subjectKind.replace(/_/g, ' ').toLowerCase()} found for this application`);
      entityName = S.labelFor(subjectKind, subject);
    }
    if (!entityName) throw new ApiError(400, 'Either a subject record or an applicant name is required');

    const instrumentClass = S.instrumentClassFor(entityType);
    const doc = await License.create({
      licenseNo: await nextNumber(License, 'licenseNo', `${S.numberPrefixFor(entityType)}-${new Date().getFullYear()}-`),
      subjectKind,
      subjectRef: subjectRef || undefined,
      subjectModel: subjectRef ? S.MODEL_NAME_BY_KIND[subjectKind] : undefined,
      instrumentClass,
      entityName, entityType, contactPerson, phone, email, address, gstin, conditions,
      appliedDate: new Date(),
      history: [{ from: '', to: 'APPLIED', at: new Date(), by: req.user.name, note: 'Application received' }],
    });
    audit(req, { action: 'CREATE', entity: 'License', entityId: doc._id, entityLabel: `${doc.licenseNo} — ${doc.entityName}`, after: doc });
    created(res, doc);
  },

  /* A1 — every instrument issued against one subject record, read from that
   * subject's own module and gated on that module's permission. */
  forSubject: (subjectKind) => async (req, res) => {
    const rows = await License.find({ subjectKind, subjectRef: req.params.id })
      .sort({ createdAt: -1 }).lean();
    ok(res, rows, { total: rows.length, subjectKind });
  },

  /* A1 — dry-run the issue checks without changing anything, so an assessing
   * officer sees what will block before committing to a decision. */
  checks: async (req, res) => {
    const doc = await License.findById(req.params.id).lean();
    if (!doc) throw new ApiError(404, 'Instrument not found');
    assertSubjectPerm(req, doc.subjectKind || 'COMPANY', 'view');
    const checks = await S.runIssueChecks(doc.subjectKind || 'COMPANY', doc.subjectRef);
    ok(res, { licenseNo: doc.licenseNo, subjectKind: doc.subjectKind, checks, blocked: S.blockingFailures(checks) });
  },
  transition: async (req, res) => {
    const doc = await License.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Instrument not found');
    const subjectKind = doc.subjectKind || 'COMPANY';
    const { to, note, expiryDate, override } = req.body || {};
    assertSubjectPerm(req, subjectKind, 'manage');
    const allowed = LICENSE_TRANSITIONS[doc.status] || [];
    if (!allowed.includes(to)) {
      throw new ApiError(409, `A ${doc.status.replace(/_/g, ' ').toLowerCase()} ${(doc.instrumentClass || 'licence').toLowerCase()} cannot move to ${String(to || '').replace(/_/g, ' ').toLowerCase()}`);
    }
    if (['SUSPENDED', 'REVOKED', 'REJECTED'].includes(to) && !note) {
      throw new ApiError(400, 'A reason note is required for this action');
    }
    const from = doc.status;

    // A1 — dependency checks run at the moment of issue and are recorded on the
    // instrument. A blocking failure stops issue unless an officer overrides
    // with a written reason, which is itself audited.
    if (to === 'ISSUED' && from !== 'SUSPENDED') {
      const checks = await S.runIssueChecks(subjectKind, doc.subjectRef);
      const blocked = S.blockingFailures(checks);
      if (blocked.length && !override) {
        throw new ApiError(409, `Cannot issue — ${blocked.map((c) => c.detail).join('; ')}`);
      }
      doc.issueChecks = checks.map(({ check, passed, detail }) => ({ check, passed, detail }));
      if (blocked.length && override) {
        if (!note) throw new ApiError(400, 'An override requires a written reason');
        doc.issueChecks.push({ check: 'Officer override', passed: true, detail: note });
      }
    }

    doc.status = to;
    if (to === 'ISSUED' && from !== 'SUSPENDED') {
      const months = S.validityMonthsFor(doc.entityType);
      doc.issueDate = new Date();
      doc.expiryDate = expiryDate ? new Date(expiryDate)
        : new Date(Date.now() + months * 30.44 * 86400000);
    }
    doc.history.push({ from, to, at: new Date(), by: req.user.name, note: note || '' });
    await doc.save();
    if (to === 'SUSPENDED' || to === 'REVOKED') {
      Notification.create({
        title: `${clsLabel(doc)} ${to.toLowerCase()} — ${doc.entityName}`,
        body: `${doc.licenseNo} (${doc.entityType.replace(/_/g, ' ')}): ${note}`,
        severity: 'warning', link: `/facilities/${doc._id}`,
        audiencePerm: `${S.permBaseFor(subjectKind)}.view`,
      }).catch(() => {});
    }
    audit(req, { action: 'TRANSITION', entity: 'License', entityId: doc._id, entityLabel: `${doc.licenseNo}: ${from} → ${to}` });
    ok(res, doc);
  },
  addAudit: async (req, res) => {
    const doc = await License.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Licence not found');
    const { date, auditor, result, remarks } = req.body || {};
    if (!date || !auditor || !result) throw new ApiError(400, 'Date, auditor and result are required');
    doc.audits.push({ date, auditor, result, remarks });
    if (result === 'SATISFACTORY' && doc.performanceRating < 5) doc.performanceRating = Math.min(5, doc.performanceRating + 0.5);
    if (result === 'NON_CONFORMITY') doc.performanceRating = Math.max(0, doc.performanceRating - 1);
    await doc.save();
    audit(req, { action: 'AUDIT_ADD', entity: 'License', entityId: doc._id, entityLabel: `${doc.licenseNo} — ${result}` });
    created(res, doc);
  },
};

/* ---------------- v8: public licence verification (QR target) ---------------- */
// Unauthenticated by design — the certificate QR resolves here. Only the
// registry facts needed to verify are exposed; a suspended or revoked licence
// fails verification instantly.
module.exports.publicVerify = async (req, res) => {
  const licenseNo = String(req.params.licenseNo || '').trim();
  const doc = await License.findOne({ licenseNo }).lean();
  if (!doc) return ok(res, { found: false, licenseNo });
  const expired = doc.expiryDate && new Date(doc.expiryDate) < new Date();
  const cls = clsLabel(doc);
  ok(res, {
    found: true,
    licenseNo: doc.licenseNo,
    entityName: doc.entityName,
    entityType: doc.entityType,
    subjectKind: doc.subjectKind || 'COMPANY',
    instrumentClass: doc.instrumentClass || 'LICENCE',
    status: doc.status,
    issueDate: doc.issueDate,
    expiryDate: doc.expiryDate,
    valid: doc.status === 'ISSUED' && !expired,
    reason: doc.status !== 'ISSUED' ? `${cls} is ${doc.status.toLowerCase()}`
      : expired ? `${cls} has expired` : `${cls} is in force`,
  });
};
