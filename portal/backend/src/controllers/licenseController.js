const { makeCrud } = require('./crudFactory');
const { License, Notification } = require('../models');
const { LICENSE_TRANSITIONS } = require('../config/constants');
const { ApiError, ok, created } = require('../utils/respond');
const { audit } = require('../utils/audit');
const { nextNumber } = require('../utils/numbering');
const { hasPerm } = require('../domain/rbac');
const S = require('../domain/licenceSubjects');
const St = require('../domain/statutoryCertificates');
const Sign = require('../domain/certificateSigning');
const { finaliseIssue } = require('../domain/instrumentIssue');

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
// `also` names permissions that govern a particular kind of instrument rather
// than a kind of subject — a survey endorsement answers to certificates.*
// whichever register the certificate sits on.
function assertSubjectPerm(req, subjectKind, action, also = []) {
  const perm = `${S.permBaseFor(subjectKind)}.${action}`;
  const candidates = [perm, `facilities.${action}`, ...also];
  if (candidates.some((c) => hasPerm(req.user.perms, c))) return;
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

  /* B2 — one instrument, with everything a holder or an inspector needs to see
   * about it: whether it is actually in force, where it stands against its
   * survey schedule, and whether its signature still matches the record. */
  get: async (req, res) => {
    const doc = await License.findById(req.params.id).lean();
    if (!doc) throw new ApiError(404, 'Instrument not found');
    assertSubjectPerm(req, doc.subjectKind || 'COMPANY', 'view', ['certificates.view']);
    const force = St.forceState(doc);
    ok(res, {
      ...doc,
      statutory: St.isStatutory(doc.entityType),
      nonExpiring: St.nonExpiring(doc.entityType),
      convention: St.CONVENTION[doc.entityType] || '',
      certificateName: St.CERT_LABEL[doc.entityType] || '',
      inForce: force.inForce,
      forceReason: force.reason,
      endorsementState: force.endorsements || null,
      signature: doc.signature && doc.signature.value
        ? { ...doc.signature, verification: Sign.verify(doc) } : null,
    });
  },

  /* B2 — the survey schedule for a statutory certificate, resolved against what
   * has actually been endorsed. This is the working view for a surveyor. */
  endorsements: async (req, res) => {
    const doc = await License.findById(req.params.id).lean();
    if (!doc) throw new ApiError(404, 'Instrument not found');
    assertSubjectPerm(req, doc.subjectKind || 'COMPANY', 'view', ['certificates.view']);
    if (!St.isStatutory(doc.entityType)) {
      throw new ApiError(400, 'This instrument is not a statutory certificate and carries no survey schedule');
    }
    const force = St.forceState(doc);
    ok(res, {
      licenseNo: doc.licenseNo,
      certificateName: St.CERT_LABEL[doc.entityType],
      convention: St.CONVENTION[doc.entityType],
      regime: St.SURVEY_REGIME[doc.entityType],
      issueDate: doc.issueDate,
      expiryDate: doc.expiryDate,
      nonExpiring: St.nonExpiring(doc.entityType),
      inForce: force.inForce,
      forceReason: force.reason,
      recorded: doc.endorsements || [],
      ...(force.endorsements || St.endorsementState(doc)),
    });
  },

  /* B2 — record a survey endorsement.
   *
   * A survey that finds the ship not in compliance is recorded exactly as one
   * that does: NOT_ENDORSED is a result, not a failure to record. A certificate
   * carrying a refused endorsement stops being in force immediately, which is
   * why it is worth being able to record it at all. */
  endorse: async (req, res) => {
    const doc = await License.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Instrument not found');
    assertSubjectPerm(req, doc.subjectKind || 'COMPANY', 'manage', ['certificates.manage']);
    if (!St.isStatutory(doc.entityType)) {
      throw new ApiError(400, 'Only a statutory certificate carries survey endorsements');
    }
    if (doc.status !== 'ISSUED') {
      throw new ApiError(409, `A ${doc.status.toLowerCase()} certificate cannot be endorsed`);
    }
    const { kind, completedOn, surveyor, organisation, place, result, remarks, anniversary } = req.body || {};
    if (!kind || !surveyor) throw new ApiError(400, 'The survey type and the surveyor are required');
    if (result === 'NOT_ENDORSED' && !remarks) {
      throw new ApiError(400, 'A refused endorsement must record why');
    }
    const when = completedOn ? new Date(completedOn) : new Date();
    // Attach the endorsement to the scheduled survey it answers, so a survey
    // held inside its window closes that window rather than floating free.
    const schedule = St.endorsementSchedule(doc.entityType, doc.issueDate, doc.expiryDate);
    const target = anniversary ? new Date(anniversary)
      : (schedule.filter((x) => x.kind === kind)
        .sort((a, b) => Math.abs(a.anniversary - when) - Math.abs(b.anniversary - when))[0] || {}).anniversary;
    doc.endorsements.push({
      kind, anniversary: target, completedOn: when, surveyor,
      organisation: organisation || '', place: place || '',
      result: result || 'ENDORSED', remarks: remarks || '',
    });
    await doc.save();
    if (result === 'NOT_ENDORSED') {
      Notification.create({
        title: `Certificate not endorsed — ${doc.entityName}`,
        body: `${doc.licenseNo} (${St.CERT_LABEL[doc.entityType]}): ${remarks}`,
        severity: 'error', link: `/certificates`,
        audiencePerm: `${S.permBaseFor(doc.subjectKind || 'COMPANY')}.view`,
      }).catch(() => {});
    }
    audit(req, { action: 'ENDORSE', entity: 'License', entityId: doc._id, entityLabel: `${doc.licenseNo} — ${kind} ${result || 'ENDORSED'}` });
    const force = St.forceState(doc.toObject());
    created(res, { instrument: doc, inForce: force.inForce, forceReason: force.reason });
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
      // B2 — sign the record and put a statutory ship certificate onto the ship
      await finaliseIssue(doc);
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
  const cls = clsLabel(doc);
  const force = St.forceState(doc);
  const statutory = St.isStatutory(doc.entityType);
  // B2 — the signature is checked against the record as it now stands, so a
  // register entry altered after issue fails verification here even though the
  // instrument still reads as in force.
  const signature = Sign.verify(doc);
  ok(res, {
    found: true,
    licenseNo: doc.licenseNo,
    entityName: doc.entityName,
    entityType: doc.entityType,
    certificateName: St.CERT_LABEL[doc.entityType] || '',
    convention: St.CONVENTION[doc.entityType] || '',
    subjectKind: doc.subjectKind || 'COMPANY',
    instrumentClass: doc.instrumentClass || 'LICENCE',
    statutory,
    nonExpiring: St.nonExpiring(doc.entityType),
    status: doc.status,
    issueDate: doc.issueDate,
    expiryDate: doc.expiryDate,
    // Valid means both: the instrument is in force, and the record proves it has
    // not been altered since it was signed.
    valid: force.inForce && (!signature.signed || signature.valid),
    reason: !force.inForce ? force.reason
      : signature.signed && !signature.valid ? signature.reason
        : `${cls} is in force`,
    signature: {
      signed: signature.signed, valid: signature.valid,
      keyId: signature.keyId || null, signedAt: signature.signedAt || null,
      note: signature.reason,
    },
    endorsements: statutory && force.endorsements ? {
      overdue: force.endorsements.overdue,
      due: force.endorsements.due,
      next: force.endorsements.next
        ? { kind: force.endorsements.next.kind, dueFrom: force.endorsements.next.dueFrom, dueTo: force.endorsements.next.dueTo }
        : null,
      completed: (doc.endorsements || []).filter((e) => e.result !== 'NOT_ENDORSED').length,
    } : null,
  });
};

/* B2 — the public key the registry signs with.
 *
 * Published unauthenticated on purpose: a signature no third party can check
 * independently is a claim, not a proof. Anyone holding a certificate can take
 * the register entry, this key and any Ed25519 implementation and verify it
 * without asking this platform for permission. */
module.exports.signingKey = (_req, res) => ok(res, {
  ...Sign.publicKey(),
  payload: 'licenseNo|entityType|subjectKind|subjectRef|entityName|issueDate(ISO)|expiryDate(ISO)|ISSUED',
  note: 'The signed payload is not stored. It is recomputed from the register entry at verification time, so any alteration to the entry invalidates the signature.',
});
