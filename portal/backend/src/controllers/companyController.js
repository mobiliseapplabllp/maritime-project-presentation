/* Port companies directory — the organisations behind agents, terminals and services. */
const { makeCrud } = require('./crudFactory');
const { Company, License, PortCall } = require('../models');
const { ApiError, ok } = require('../utils/respond');

const base = makeCrud(Company, {
  entity: 'Company', labelField: 'name',
  fields: ['code', 'name', 'types', 'category', 'contactPerson', 'phone', 'email', 'address',
    'city', 'state', 'gstin', 'pan', 'status', 'onboardedAt', 'rating', 'remarks'],
  searchFields: ['code', 'name', 'contactPerson', 'gstin'],
  filterFields: ['category', 'status', 'city'],
  defaultSort: 'name',
  validate: (body, isCreate) => {
    if (isCreate && !body.code) throw new ApiError(400, 'A short company code is required');
  },
});

module.exports = {
  ...base,
  get: async (req, res) => {
    const doc = await Company.findById(req.params.id).lean();
    if (!doc) throw new ApiError(404, 'Company not found');
    const [licences, activeCalls] = await Promise.all([
      License.find({ entityName: doc.name }).sort('-appliedDate').lean(),
      PortCall.countDocuments({ agentCode: doc.code, status: { $in: ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'] } }),
    ]);
    ok(res, { ...doc, licences, activeCalls });
  },
};
