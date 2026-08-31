// Generic CRUD handler factory used by masters and simple registries.
const { ApiError, ok, created } = require('../utils/respond');
const { parseQuery, searchFilter } = require('../utils/paginate');
const { audit } = require('../utils/audit');

function makeCrud(Model, {
  entity, labelField = 'name', fields = [], searchFields = [],
  filterFields = [], defaultSort = '-createdAt', populate = null,
  validate = null,       // (body, isCreate) -> throws ApiError
  beforeDelete = null,   // async (doc) -> throws ApiError to block
}) {
  const pickFields = (body) => Object.fromEntries(
    fields.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));

  return {
    list: async (req, res) => {
      const { page, limit, skip, sort } = parseQuery(req.query, { defaultSort });
      const filter = {};
      for (const f of filterFields) if (req.query[f] !== undefined && req.query[f] !== '') filter[f] = req.query[f];
      if (req.query.active === 'true') filter.active = true;
      if (req.query.active === 'false') filter.active = false;
      const search = searchFilter(req.query.q, searchFields);
      if (search) Object.assign(filter, search);
      let q = Model.find(filter).sort(sort).skip(skip).limit(limit);
      if (populate) q = q.populate(populate);
      const [items, total] = await Promise.all([q, Model.countDocuments(filter)]);
      ok(res, items, { total, page, limit });
    },
    get: async (req, res) => {
      let q = Model.findById(req.params.id);
      if (populate) q = q.populate(populate);
      const doc = await q;
      if (!doc) throw new ApiError(404, `${entity} not found`);
      ok(res, doc);
    },
    create: async (req, res) => {
      if (validate) validate(req.body || {}, true);
      const doc = await Model.create(pickFields(req.body || {}));
      audit(req, { action: 'CREATE', entity, entityId: doc._id, entityLabel: doc[labelField], after: doc });
      created(res, doc);
    },
    update: async (req, res) => {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw new ApiError(404, `${entity} not found`);
      if (validate) validate(req.body || {}, false);
      const before = doc.toObject();
      Object.assign(doc, pickFields(req.body || {}));
      await doc.save();
      audit(req, { action: 'UPDATE', entity, entityId: doc._id, entityLabel: doc[labelField], before, after: doc });
      ok(res, doc);
    },
    remove: async (req, res) => {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw new ApiError(404, `${entity} not found`);
      if (beforeDelete) await beforeDelete(doc);
      await doc.deleteOne();
      audit(req, { action: 'DELETE', entity, entityId: doc._id, entityLabel: doc[labelField], before: doc });
      ok(res, { deleted: true });
    },
  };
}

module.exports = { makeCrud };
