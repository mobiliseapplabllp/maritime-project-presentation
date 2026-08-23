const { makeCrud } = require('./crudFactory');
const { Instrument } = require('../models');
const { ApiError, ok } = require('../utils/respond');
const { audit } = require('../utils/audit');

const base = makeCrud(Instrument, {
  entity: 'Instrument', labelField: 'refNo',
  fields: ['refNo', 'title', 'type', 'category', 'status', 'issuedBy', 'issuedDate', 'effectiveDate',
    'summary', 'body', 'tags', 'supersedes', 'ackRequired'],
  searchFields: ['refNo', 'title', 'summary'], filterFields: ['type', 'category', 'status'],
  defaultSort: '-issuedDate',
});

module.exports = {
  ...base,
  acknowledge: async (req, res) => {
    const doc = await Instrument.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Instrument not found');
    if (!doc.ackRequired) throw new ApiError(400, 'This instrument does not require acknowledgment');
    const uid = String(req.user.id);
    if (doc.acknowledgedBy.some((a) => a.userId === uid)) return ok(res, doc);
    doc.acknowledgedBy.push({ userId: uid, name: req.user.name, at: new Date() });
    await doc.save();
    audit(req, { action: 'ACKNOWLEDGE', entity: 'Instrument', entityId: doc._id, entityLabel: doc.refNo });
    ok(res, doc);
  },
};
