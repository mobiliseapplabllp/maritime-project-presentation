const { makeCrud } = require('./crudFactory');
const { Vessel, PortCall, Inspection } = require('../models');
const { certStatus } = require('../domain/certStatus');
const { ApiError, ok, created } = require('../utils/respond');
const { audit } = require('../utils/audit');

const base = makeCrud(Vessel, {
  entity: 'Vessel', labelField: 'name',
  fields: ['name', 'imo', 'mmsi', 'callSign', 'flag', 'type', 'built', 'dwt', 'grt',
    'loa', 'beam', 'maxDraft', 'owner', 'agent', 'classSociety', 'status'],
  searchFields: ['name', 'imo', 'callSign'], filterFields: ['type', 'flag', 'status', 'agent'],
  defaultSort: 'name',
  validate: (body, isCreate) => {
    if (isCreate && !/^\d{7}$/.test(String(body.imo || ''))) throw new ApiError(400, 'IMO number must be 7 digits');
  },
  beforeDelete: async (doc) => {
    const calls = await PortCall.countDocuments({ vessel: doc._id });
    if (calls) throw new ApiError(400, 'This vessel has port call history — deactivate it instead of deleting');
  },
});

const withCertStatus = (v) => {
  const o = v.toObject();
  o.certificates = (o.certificates || [])
    .map((c) => ({ ...c, status: certStatus(c.expiryDate) }))
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  return o;
};

module.exports = {
  ...base,
  get: async (req, res) => {
    const v = await Vessel.findById(req.params.id);
    if (!v) throw new ApiError(404, 'Vessel not found');
    const [calls, inspections] = await Promise.all([
      PortCall.find({ vessel: v._id }).sort('-eta').limit(15).populate('berth', 'code name').lean(),
      Inspection.find({ vessel: v._id }).sort('-plannedAt').limit(10).lean(),
    ]);
    ok(res, { ...withCertStatus(v), recentCalls: calls, recentInspections: inspections });
  },

  addCert: async (req, res) => {
    const v = await Vessel.findById(req.params.id);
    if (!v) throw new ApiError(404, 'Vessel not found');
    const { certType, number, issuer, issueDate, expiryDate, remarks } = req.body || {};
    if (!certType || !expiryDate) throw new ApiError(400, 'Certificate type and expiry date are required');
    v.certificates.push({ certType, number, issuer, issueDate, expiryDate, remarks });
    await v.save();
    audit(req, { action: 'CERT_ADD', entity: 'Vessel', entityId: v._id, entityLabel: `${v.name} — ${certType}` });
    created(res, withCertStatus(v));
  },

  updateCert: async (req, res) => {
    const v = await Vessel.findById(req.params.id);
    if (!v) throw new ApiError(404, 'Vessel not found');
    const cert = v.certificates.id(req.params.certId);
    if (!cert) throw new ApiError(404, 'Certificate not found');
    const before = cert.toObject();
    for (const f of ['certType', 'number', 'issuer', 'issueDate', 'expiryDate', 'remarks']) {
      if (req.body[f] !== undefined) cert[f] = req.body[f];
    }
    await v.save();
    audit(req, { action: 'CERT_UPDATE', entity: 'Vessel', entityId: v._id, entityLabel: `${v.name} — ${cert.certType}`, before, after: cert.toObject() });
    ok(res, withCertStatus(v));
  },

  removeCert: async (req, res) => {
    const v = await Vessel.findById(req.params.id);
    if (!v) throw new ApiError(404, 'Vessel not found');
    const cert = v.certificates.id(req.params.certId);
    if (!cert) throw new ApiError(404, 'Certificate not found');
    audit(req, { action: 'CERT_DELETE', entity: 'Vessel', entityId: v._id, entityLabel: `${v.name} — ${cert.certType}`, before: cert.toObject() });
    cert.deleteOne();
    await v.save();
    ok(res, withCertStatus(v));
  },

  // Fleet-wide certificate register with derived status
  allCertificates: async (req, res) => {
    const vessels = await Vessel.find({ status: 'ACTIVE' }).select('name imo certificates').lean();
    let rows = vessels.flatMap((v) => (v.certificates || []).map((c) => ({
      vesselId: v._id, vesselName: v.name, imo: v.imo,
      certId: c._id, certType: c.certType, number: c.number, issuer: c.issuer,
      issueDate: c.issueDate, expiryDate: c.expiryDate, status: certStatus(c.expiryDate),
    })));
    const { status, q } = req.query;
    if (status) rows = rows.filter((r) => r.status === status);
    if (q) {
      const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      rows = rows.filter((r) => rx.test(r.vesselName) || rx.test(r.certType) || rx.test(r.number || ''));
    }
    rows.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    const total = rows.length;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 25);
    ok(res, rows.slice((page - 1) * limit, page * limit), { total, page, limit });
  },
};
