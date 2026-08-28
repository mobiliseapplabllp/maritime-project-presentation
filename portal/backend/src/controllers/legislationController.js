const { makeCrud } = require('./crudFactory');
const { Instrument } = require('../models');
const { ApiError, ok } = require('../utils/respond');
const { audit } = require('../utils/audit');
const { canTransition, canApprove } = require('../domain/legislationGovernance');

const base = makeCrud(Instrument, {
  entity: 'Instrument', labelField: 'refNo',
  fields: ['refNo', 'title', 'type', 'category', 'status', 'issuedBy', 'issuedDate', 'effectiveDate',
    'summary', 'body', 'tags', 'supersedes', 'ackRequired'],
  searchFields: ['refNo', 'title', 'summary'], filterFields: ['type', 'category', 'status'],
  defaultSort: '-issuedDate',
});

module.exports = {
  ...base,

  /* Drafting records who drafted, because approval later has to compare against
   * it. A new instrument starts as a draft unless it is being recorded as an
   * existing one — an authority migrating its library is not "drafting" a
   * convention from 1974. */
  create: async (req, res) => {
    req.body.draftedBy = String(req.user.id);
    req.body.draftedByName = req.user.name;
    if (!req.body.status) req.body.status = 'DRAFT';
    return base.create(req, res);
  },

  /* Status is not an ordinary field. Moving it goes through the lifecycle rules,
   * and moving it to IN_FORCE goes through approval instead of through here. */
  update: async (req, res) => {
    const doc = await Instrument.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Instrument not found');
    const next = req.body.status;
    if (next && next !== doc.status) {
      if (next === 'IN_FORCE') {
        throw new ApiError(409, 'An instrument is put in force by approval, not by editing its status');
      }
      const move = canTransition(doc.status, next);
      if (!move.ok) throw new ApiError(409, move.error);
    }
    return base.update(req, res);
  },

  /* Put a draft in force. Requires legislation.approve — and requires not being
   * the person who drafted it, which is the separation the permission alone
   * cannot express. */
  publish: async (req, res) => {
    const doc = await Instrument.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Instrument not found');
    const verdict = canApprove(doc, req.user.id);
    if (!verdict.ok) throw new ApiError(409, verdict.error);

    const before = { status: doc.status, approvedBy: doc.approvedBy };
    doc.status = 'IN_FORCE';
    doc.approvedBy = String(req.user.id);
    doc.approvedByName = req.user.name;
    doc.approvedAt = new Date();
    if (req.body.effectiveDate) doc.effectiveDate = req.body.effectiveDate;
    if (!doc.effectiveDate) doc.effectiveDate = doc.approvedAt;
    await doc.save();

    audit(req, {
      action: 'APPROVE', entity: 'Instrument', entityId: doc._id, entityLabel: doc.refNo,
      before, after: { status: doc.status, approvedBy: doc.approvedBy, approvedAt: doc.approvedAt },
    });
    ok(res, doc);
  },

  acknowledge: async (req, res) => {
    const doc = await Instrument.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Instrument not found');
    if (!doc.ackRequired) throw new ApiError(400, 'This instrument does not require acknowledgment');
    if (doc.status !== 'IN_FORCE') throw new ApiError(400, 'Only an instrument in force can be acknowledged');
    const uid = String(req.user.id);
    if (doc.acknowledgedBy.some((a) => a.userId === uid)) return ok(res, doc);
    doc.acknowledgedBy.push({ userId: uid, name: req.user.name, at: new Date() });
    await doc.save();
    audit(req, { action: 'ACKNOWLEDGE', entity: 'Instrument', entityId: doc._id, entityLabel: doc.refNo });
    ok(res, doc);
  },
};
