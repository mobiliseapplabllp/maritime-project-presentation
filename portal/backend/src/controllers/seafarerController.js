const { makeCrud } = require('./crudFactory');
const { Seafarer } = require('../models');
const { certStatus } = require('../domain/certStatus');
const { ApiError, ok, created } = require('../utils/respond');
const { audit } = require('../utils/audit');

const base = makeCrud(Seafarer, {
  entity: 'Seafarer', labelField: 'name',
  fields: ['cdcNo', 'indosNo', 'name', 'dob', 'nationality', 'rank', 'phone', 'email', 'status', 'currentVessel', 'remarks'],
  searchFields: ['name', 'cdcNo', 'indosNo'], filterFields: ['rank', 'status', 'nationality'],
  defaultSort: 'name', populate: { path: 'currentVessel', select: 'name imo' },
});

const decorate = (doc) => {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  o.certificates = (o.certificates || []).map((c) => ({ ...c, status: certStatus(c.expiryDate) }))
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  o.certAlerts = o.certificates.filter((c) => c.status !== 'VALID').length;
  o.totalSeaDays = (o.seaService || []).reduce((s, x) => s + Math.round((new Date(x.to) - new Date(x.from)) / 86400000), 0);
  return o;
};

module.exports = {
  ...base,
  list: async (req, res, next) => {
    // reuse base list, then decorate certificate summaries
    const json = res.json.bind(res);
    res.json = (payload) => json({ ...payload, data: payload.data.map(decorate) });
    return base.list(req, res, next);
  },
  get: async (req, res) => {
    const doc = await Seafarer.findById(req.params.id).populate('currentVessel', 'name imo');
    if (!doc) throw new ApiError(404, 'Seafarer not found');
    ok(res, decorate(doc));
  },
  addCert: async (req, res) => {
    const doc = await Seafarer.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Seafarer not found');
    const { certType, grade, number, issuer, issueDate, expiryDate, remarks } = req.body || {};
    if (!certType || !expiryDate) throw new ApiError(400, 'Certificate type and expiry are required');
    doc.certificates.push({ certType, grade, number, issuer, issueDate, expiryDate, remarks });
    await doc.save();
    audit(req, { action: 'CERT_ADD', entity: 'Seafarer', entityId: doc._id, entityLabel: `${doc.name} — ${certType}` });
    created(res, decorate(doc));
  },
  updateCert: async (req, res) => {
    const doc = await Seafarer.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Seafarer not found');
    const cert = doc.certificates.id(req.params.certId);
    if (!cert) throw new ApiError(404, 'Certificate not found');
    const before = cert.toObject();
    for (const f of ['certType', 'grade', 'number', 'issuer', 'issueDate', 'expiryDate', 'remarks']) {
      if (req.body[f] !== undefined) cert[f] = req.body[f];
    }
    await doc.save();
    audit(req, { action: 'CERT_UPDATE', entity: 'Seafarer', entityId: doc._id, entityLabel: `${doc.name} — ${cert.certType}`, before, after: cert.toObject() });
    ok(res, decorate(doc));
  },
  removeCert: async (req, res) => {
    const doc = await Seafarer.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Seafarer not found');
    const cert = doc.certificates.id(req.params.certId);
    if (!cert) throw new ApiError(404, 'Certificate not found');
    audit(req, { action: 'CERT_DELETE', entity: 'Seafarer', entityId: doc._id, entityLabel: `${doc.name} — ${cert.certType}`, before: cert.toObject() });
    cert.deleteOne();
    await doc.save();
    ok(res, decorate(doc));
  },
  addService: async (req, res) => {
    const doc = await Seafarer.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Seafarer not found');
    const { vesselName, imo, rank, from, to, verified, remarks } = req.body || {};
    if (!vesselName || !rank || !from || !to) throw new ApiError(400, 'Vessel, rank, from and to dates are required');
    if (new Date(to) <= new Date(from)) throw new ApiError(400, 'Sign-off date must be after sign-on date');
    doc.seaService.push({ vesselName, imo, rank, from, to, verified: !!verified, remarks });
    await doc.save();
    audit(req, { action: 'SERVICE_ADD', entity: 'Seafarer', entityId: doc._id, entityLabel: `${doc.name} — ${vesselName}` });
    created(res, decorate(doc));
  },
  removeService: async (req, res) => {
    const doc = await Seafarer.findById(req.params.id);
    if (!doc) throw new ApiError(404, 'Seafarer not found');
    const svc = doc.seaService.id(req.params.serviceId);
    if (!svc) throw new ApiError(404, 'Sea-service record not found');
    audit(req, { action: 'SERVICE_DELETE', entity: 'Seafarer', entityId: doc._id, entityLabel: `${doc.name} — ${svc.vesselName}`, before: svc.toObject() });
    svc.deleteOne();
    await doc.save();
    ok(res, decorate(doc));
  },
};


// Crew dashboard — roll KPIs, rank mix, document expiry funnel and onboard roll
module.exports.dashboard = async (_req, res) => {
  const { ok } = require('../utils/respond');
  const { certStatus } = require('../domain/certStatus');
  const settings = require('../config/settingsCache').moduleGet('crew');
  const D2 = 24 * 3600 * 1000;
  const crew = await Seafarer.find().populate('currentVessel', 'name').lean();
  const byRank = {};
  const funnel = { expired: 0, d30: 0, d90: 0, valid: 0 };
  let onboard = 0; let medicalIssues = 0; let seaDays = 0;
  const alertList = [];
  for (const s2 of crew) {
    byRank[s2.rank] = (byRank[s2.rank] || 0) + 1;
    if (s2.currentVessel) onboard += 1;
    seaDays += (s2.seaService || []).reduce((t, x) => t + Math.max(0, Math.round((new Date(x.to) - new Date(x.from)) / D2)), 0);
    let alerts = 0;
    for (const c of s2.certificates || []) {
      const days = Math.floor((new Date(c.expiryDate) - Date.now()) / D2);
      if (days < 0) { funnel.expired += 1; alerts += 1; }
      else if (days <= 30) { funnel.d30 += 1; alerts += 1; }
      else if (days <= 90) funnel.d90 += 1;
      else funnel.valid += 1;
      if (/medical/i.test(c.certType) && certStatus(c.expiryDate) !== 'VALID') medicalIssues += 1;
    }
    if (alerts) alertList.push({ _id: s2._id, name: s2.name, rank: s2.rank, vessel: s2.currentVessel?.name || 'Ashore', alerts });
  }
  alertList.sort((a, b) => b.alerts - a.alerts);
  ok(res, {
    kpis: {
      roll: crew.length, onboard, ashore: crew.length - onboard,
      medicalIssues, avgSeaDays: crew.length ? Math.round(seaDays / crew.length) : 0,
      medicalWindow: settings.medicalExpiringDays || 45,
    },
    byRank: Object.entries(byRank).map(([rank, count]) => ({ rank, count })).sort((a, b) => b.count - a.count),
    funnel,
    alertList: alertList.slice(0, 10),
  });
};
