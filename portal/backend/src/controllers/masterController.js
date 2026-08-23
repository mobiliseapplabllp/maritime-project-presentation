const { makeCrud } = require('./crudFactory');
const { ApiError } = require('../utils/respond');
const { LOOKUP_CATEGORIES } = require('../config/constants');
const { Berth, Lookup, TariffItem, ChecklistTemplate, PortCall } = require('../models');

const berths = makeCrud(Berth, {
  entity: 'Berth', labelField: 'code',
  fields: ['code', 'name', 'terminal', 'berthType', 'loaMax', 'draftMax', 'status', 'remarks'],
  searchFields: ['code', 'name', 'terminal'], filterFields: ['terminal', 'berthType', 'status'],
  defaultSort: 'code',
  beforeDelete: async (doc) => {
    const inUse = await PortCall.countDocuments({ berth: doc._id, status: { $in: ['CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'] } });
    if (inUse) throw new ApiError(400, 'This berth has active or planned port calls — free it first');
  },
});

const lookups = makeCrud(Lookup, {
  entity: 'Lookup', labelField: 'label',
  fields: ['category', 'code', 'label', 'meta', 'active'],
  searchFields: ['code', 'label'], filterFields: ['category'],
  defaultSort: 'code',
  validate: (body, isCreate) => {
    if (isCreate && !LOOKUP_CATEGORIES.some((c) => c.key === body.category)) {
      throw new ApiError(400, `Unknown lookup category "${body.category}"`);
    }
  },
});

const tariffs = makeCrud(TariffItem, {
  entity: 'TariffItem', labelField: 'code',
  fields: ['code', 'name', 'category', 'unit', 'rate', 'currency', 'active'],
  searchFields: ['code', 'name'], filterFields: ['category'], defaultSort: 'code',
  validate: (body) => {
    if (body.rate !== undefined && (typeof body.rate !== 'number' || body.rate < 0)) {
      throw new ApiError(400, 'Rate must be a non-negative number');
    }
  },
});

const checklists = makeCrud(ChecklistTemplate, {
  entity: 'ChecklistTemplate', labelField: 'name',
  fields: ['name', 'inspectionType', 'description', 'items', 'active', 'version', 'passScorePct'],
  searchFields: ['name'], filterFields: ['inspectionType'], defaultSort: 'name',
  validate: (body) => {
    if (body.items !== undefined) {
      if (!Array.isArray(body.items) || body.items.some((i) => !i.text)) {
        throw new ApiError(400, 'Every checklist item needs text');
      }
      body.items = body.items.map((i, idx) => ({ seq: idx + 1, text: i.text, category: i.category || 'General' }));
    }
  },
});

module.exports = { berths, lookups, tariffs, checklists };
