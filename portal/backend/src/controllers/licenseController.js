const { makeCrud } = require('./crudFactory');
const { License, Notification } = require('../models');
const { LICENSE_TRANSITIONS } = require('../config/constants');
const { ApiError, ok, created } = require('../utils/respond');
const { audit } = require('../utils/audit');
const { nextNumber } = require('../utils/numbering');

const base = makeCrud(License, {
  entity: 'License', labelField: 'licenseNo',
  fields: ['entityName', 'entityType', 'contactPerson', 'phone', 'email', 'address', 'gstin',
    'expiryDate', 'conditions', 'performanceRating'],
  searchFields: ['licenseNo', 'entityName'], filterFields: ['entityType', 'status'],
  defaultSort: '-createdAt',
});

module.exports = {
  ...base,
  create: async (req, res) => {
    const { entityName, entityType, contactPerson, phone, email, address, gstin, conditions } = req.body || {};
    if (!entityName || !entityType) throw new ApiError(400, 'Entity name and licence type are required');
    const doc = await License.create({
      licenseNo: await nextNumber(License, 'licenseNo', `LIC-${new Date().getFullYear()}-`),
      entityName, entityType, contactPerson, phone, email, address, gstin, conditions,
      appliedDate: new Date(),
      history: [{ from: '', to: 'APPLIED', at: new Date(), by: req.user.name, note: 'Application received' }],
    });
    audit(req, { action: 'CREATE', entity: 'License', entityId: doc._id, entityLabel: `${doc.licenseNo} — ${doc.entityName}`, after: doc });
    created(res, doc);
  },
  transition: async (req, res) => {
    const doc = await License.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Licence not found');
    const { to, note, expiryDate } = req.body || {};
    const allowed = LICENSE_TRANSITIONS[doc.status] || [];
    if (!allowed.includes(to)) {
      throw new ApiError(409, `A ${doc.status.replace(/_/g, ' ').toLowerCase()} licence cannot move to ${String(to || '').replace(/_/g, ' ').toLowerCase()}`);
    }
    if (['SUSPENDED', 'REVOKED', 'REJECTED'].includes(to) && !note) {
      throw new ApiError(400, 'A reason note is required for this action');
    }
    const from = doc.status;
    doc.status = to;
    if (to === 'ISSUED' && from !== 'SUSPENDED') {
      doc.issueDate = new Date();
      doc.expiryDate = expiryDate ? new Date(expiryDate) : new Date(Date.now() + 2 * 365 * 86400000);
    }
    doc.history.push({ from, to, at: new Date(), by: req.user.name, note: note || '' });
    await doc.save();
    if (to === 'SUSPENDED' || to === 'REVOKED') {
      Notification.create({
        title: `Licence ${to.toLowerCase()} — ${doc.entityName}`,
        body: `${doc.licenseNo} (${doc.entityType.replace(/_/g, ' ')}): ${note}`,
        severity: 'warning', link: `/facilities/${doc._id}`, audiencePerm: 'facilities.view',
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
  ok(res, {
    found: true,
    licenseNo: doc.licenseNo,
    entityName: doc.entityName,
    entityType: doc.entityType,
    status: doc.status,
    issueDate: doc.issueDate,
    expiryDate: doc.expiryDate,
    valid: doc.status === 'ISSUED' && !expired,
    reason: doc.status !== 'ISSUED' ? `Licence is ${doc.status.toLowerCase()}` : expired ? 'Licence has expired' : 'Licence is in force',
  });
};
