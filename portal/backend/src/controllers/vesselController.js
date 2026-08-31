const { makeCrud } = require('./crudFactory');
const { Vessel, PortCall, Inspection, Incident, Seafarer, Position, License } = require('../models');
const { certStatus } = require('../domain/certStatus');
const SC = require('../domain/statutoryCertificates');
const { ApiError, ok, created } = require('../utils/respond');
const { audit } = require('../utils/audit');

const base = makeCrud(Vessel, {
  entity: 'Vessel', labelField: 'name',
  fields: ['name', 'imo', 'mmsi', 'callSign', 'flag', 'type', 'built', 'dwt', 'grt',
    'loa', 'beam', 'maxDraft', 'owner', 'operator', 'manager', 'agent', 'classSociety', 'piClub',
    'portOfRegistry', 'yard', 'engine', 'serviceSpeedKn', 'teuCapacity', 'lastDryDock', 'nextDryDock', 'status'],
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
    const [calls, inspections, incidents, crew, position] = await Promise.all([
      PortCall.find({ vessel: v._id }).sort('-eta').limit(20).populate('berth', 'code name terminal').lean(),
      Inspection.find({ vessel: v._id }).sort('-plannedAt').limit(12).lean(),
      Incident.find({ vessel: v._id }).sort('-reportedAt').limit(12)
        .select('number title type severity status reportedAt closedAt').lean(),
      Seafarer.find({ currentVessel: v._id }).select('name rank cdcNo nationality status certificates').lean(),
      Position.findOne({ vessel: v._id }).lean(),
    ]);
    const crewOut = crew.map((s) => ({
      _id: s._id, name: s.name, rank: s.rank, cdcNo: s.cdcNo, nationality: s.nationality, status: s.status,
      certAlerts: (s.certificates || []).filter((c) => certStatus(c.expiryDate) !== 'VALID').length,
    }));
    ok(res, { ...withCertStatus(v), recentCalls: calls, recentInspections: inspections,
      recentIncidents: incidents, crewOnBoard: crewOut, lastPosition: position });
  },

  // Voyage ledger derived from the port-call record — leg in (prevPort → REFPT) and leg out (REFPT → nextPort)
  voyages: async (req, res) => {
    const v = await Vessel.findById(req.params.id).select('name');
    if (!v) throw new ApiError(404, 'Vessel not found');
    const calls = await PortCall.find({ vessel: v._id, status: 'SAILED' })
      .sort('-atd').limit(40).populate('berth', 'code terminal').lean();
    const voyages = calls.map((c) => ({
      callId: c._id, vcn: c.vcn,
      fromPort: c.prevPort || '—', toPort: c.nextPort || '—',
      arrived: c.ata, sailed: c.atd, berth: c.berth ? c.berth.code : '—',
      terminal: c.berth ? c.berth.terminal : '—',
      purpose: c.purpose,
      cargo: (c.cargoOps || []).map((o) => `${o.operation === 'LOAD' ? 'Loaded' : 'Discharged'} ${new Intl.NumberFormat('en-IN').format(o.qty)} ${o.unit} ${o.cargoType}`).join('; '),
      portDays: c.ata && c.atd ? Math.round(((new Date(c.atd) - new Date(c.ata)) / 86400000) * 10) / 10 : null,
    }));
    // trade-lane frequency for the route summary
    const laneCount = {};
    for (const c of calls) {
      for (const p of [c.prevPort, c.nextPort]) {
        if (p) laneCount[p] = (laneCount[p] || 0) + 1;
      }
    }
    const lanes = Object.entries(laneCount).map(([port, calls2]) => ({ port, calls: calls2 }))
      .sort((a, b) => b.calls - a.calls).slice(0, 8);
    ok(res, { voyages, lanes });
  },

  // Movement picture: latest AIS position + the port's own event trail for the vessel
  movements: async (req, res) => {
    const v = await Vessel.findById(req.params.id).select('name');
    if (!v) throw new ApiError(404, 'Vessel not found');
    const [position, calls] = await Promise.all([
      Position.findOne({ vessel: v._id }).lean(),
      PortCall.find({ vessel: v._id }).sort('-eta').limit(12).select('vcn status statusHistory ata atb atd eta').lean(),
    ]);
    const events = calls.flatMap((c) => (c.statusHistory || []).map((h) => ({
      at: h.at, vcn: c.vcn, event: h.to, note: h.note || '',
    }))).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 40);
    ok(res, { position, events });
  },

  // Fleet dashboard — the vessel module's own landing analytics
  fleetDashboard: async (req, res) => {
    const now = new Date();
    const [vessels, active] = await Promise.all([
      Vessel.find().select('name type flag built status certificates dwt grt agent classSociety').lean(),
      PortCall.find({ status: { $in: ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'] } }).select('vessel status').lean(),
    ]);
    const activeSet = new Map(active.map((c) => [String(c.vessel), c.status]));
    const fleet = vessels.filter((v) => v.status === 'ACTIVE');
    const byType = {}; const byFlag = {}; const byClass = {}; const ageBands = { '0-5': 0, '6-10': 0, '11-15': 0, '16-20': 0, '>20': 0 };
    let certValid = 0; let certExpiring = 0; let certExpired = 0;
    const certAlertVessels = [];
    for (const v of fleet) {
      byType[v.type] = (byType[v.type] || 0) + 1;
      byFlag[v.flag] = (byFlag[v.flag] || 0) + 1;
      byClass[v.classSociety || '—'] = (byClass[v.classSociety || '—'] || 0) + 1;
      const age = now.getFullYear() - (v.built || now.getFullYear());
      ageBands[age <= 5 ? '0-5' : age <= 10 ? '6-10' : age <= 15 ? '11-15' : age <= 20 ? '16-20' : '>20'] += 1;
      let alerts = 0;
      for (const c of v.certificates || []) {
        const st = certStatus(c.expiryDate);
        if (st === 'VALID') certValid += 1;
        else if (st === 'EXPIRING') { certExpiring += 1; alerts += 1; }
        else { certExpired += 1; alerts += 1; }
      }
      if (alerts) certAlertVessels.push({ _id: v._id, name: v.name, type: v.type, alerts });
    }
    certAlertVessels.sort((a, b) => b.alerts - a.alerts);
    ok(res, {
      kpis: {
        fleet: fleet.length, inactive: vessels.length - fleet.length,
        inPort: [...activeSet.values()].filter((s) => s === 'BERTHED').length,
        inbound: [...activeSet.values()].filter((s) => ['ANNOUNCED', 'CONFIRMED'].includes(s)).length,
        atAnchor: [...activeSet.values()].filter((s) => s === 'AT_ANCHORAGE').length,
        avgAge: fleet.length ? Math.round(fleet.reduce((s2, v) => s2 + (now.getFullYear() - (v.built || now.getFullYear())), 0) / fleet.length) : 0,
        totalDwt: fleet.reduce((s2, v) => s2 + (v.dwt || 0), 0),
      },
      byType: Object.entries(byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      byFlag: Object.entries(byFlag).map(([flag, count]) => ({ flag, count })).sort((a, b) => b.count - a.count),
      byClass: Object.entries(byClass).map(([cls, count]) => ({ cls, count })).sort((a, b) => b.count - a.count),
      ageBands: Object.entries(ageBands).map(([band, count]) => ({ band, count })),
      certs: { valid: certValid, expiring: certExpiring, expired: certExpired },
      certAlertVessels: certAlertVessels.slice(0, 8),
    });
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
    const [vessels, instruments] = await Promise.all([
      Vessel.find({ status: 'ACTIVE' }).select('name imo certificates registry').lean(),
      License.find({ instrumentClass: 'CERTIFICATE', subjectKind: 'VESSEL' })
        .select('licenseNo entityType status issueDate expiryDate endorsements signature').lean(),
    ]);
    /* B2 — a certificate this administration issued is on the register as well
     * as on the ship, and the register knows two things the ship's own list
     * cannot: whether the survey endorsements are up to date, and whether the
     * record still matches the signature taken at issue. Both are worth more
     * than the expiry date, because a certificate can be unexpired and still
     * not in force. */
    const byNo = new Map(instruments.map((i) => [i.licenseNo, i]));
    const now = new Date();
    let rows = vessels.flatMap((v) => (v.certificates || []).map((c) => {
      const inst = byNo.get(c.number);
      const force = inst ? SC.forceState(inst) : null;
      // The certificate of registry is on this register too, but it comes from
      // the registration engine rather than the instrument register, so its
      // standing is read off the ship's registry entry.
      const isCoR = c.certType === 'Certificate of Registry';
      const reg = v.registry || {};
      const corOnRegister = isCoR && reg.certificateNo === c.number;
      const corInForce = corOnRegister && reg.state !== 'CLOSED'
        && !(reg.state === 'PROVISIONAL' && reg.certificateExpiresOn && new Date(reg.certificateExpiresOn) < now);
      return {
        vesselId: v._id, vesselName: v.name, imo: v.imo,
        certId: c._id, certType: c.certType, number: c.number, issuer: c.issuer,
        issueDate: c.issueDate, expiryDate: c.expiryDate, status: certStatus(c.expiryDate),
        instrumentId: inst ? inst._id : null,
        onRegister: !!inst || corOnRegister,
        signed: !!(inst && inst.signature && inst.signature.value),
        inForce: inst ? force.inForce : corOnRegister ? corInForce : null,
        forceReason: inst ? force.reason
          : corOnRegister ? (corInForce ? 'Registry entry current'
            : reg.state === 'CLOSED' ? 'Registry closed' : 'Provisional certificate has expired') : '',
        endorsementsOverdue: force && force.endorsements ? force.endorsements.overdue : 0,
      };
    }));
    const { status, q } = req.query;
    if (status) rows = rows.filter((r) => r.status === status);
    if (req.query.notInForce === 'true') rows = rows.filter((r) => r.onRegister && !r.inForce);
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

/* ---------------- v8: class survey & dry-dock planner ---------------- */
// Windows derived from the class cycle: annual surveys on the anniversary of
// the last docking (±3 months), an intermediate at 2.5 years, a special
// survey + docking at 5 — the DNV/ABS pattern every superintendent knows.
module.exports.surveyPlanner = async (_req, res) => {
  const MONTH = 30.44 * 24 * 3600 * 1000;
  const now = Date.now();
  const horizon = now + 24 * MONTH;
  const vessels = await Vessel.find({ status: 'ACTIVE' })
    .select('name imo type classSociety built lastDryDock flag').sort('name').lean();
  const lanes = vessels.map((v) => {
    let anchor = v.lastDryDock ? new Date(v.lastDryDock).getTime()
      : new Date(v.built || 2018, 5, 15).getTime();
    // roll old anchors forward by 5-year class cycles so every vessel shows
    // its CURRENT cycle (a 2009-built ship is on her 4th special survey, not her 1st)
    while (anchor + 60 * MONTH < now) anchor += 60 * MONTH;
    const events = [];
    const push = (type, dueMs, windowMonths) => {
      if (dueMs < now - 6 * MONTH || dueMs > horizon) return;
      const from = dueMs - windowMonths * MONTH;
      const to = dueMs + windowMonths * MONTH;
      events.push({
        type, due: new Date(dueMs), window: { from: new Date(from), to: new Date(to) },
        status: now > to ? 'OVERDUE' : now >= from ? 'WINDOW_OPEN' : 'PLANNED',
      });
    };
    // annuals each year from the anchor; intermediate at 2.5y; special+docking at 5y
    for (let y = 1; y <= 6; y += 1) push('ANNUAL', anchor + y * 12 * MONTH, 3);
    push('INTERMEDIATE', anchor + 30 * MONTH, 3);
    push('SPECIAL', anchor + 60 * MONTH, 3);
    push('DRY_DOCK', anchor + 60 * MONTH, 2);
    events.sort((a, b) => new Date(a.due) - new Date(b.due));
    return {
      vessel: { _id: v._id, name: v.name, imo: v.imo, type: v.type, classSociety: v.classSociety, lastDryDock: v.lastDryDock },
      events,
    };
  });
  ok(res, { horizonMonths: 24, from: new Date(now - 6 * MONTH), to: new Date(horizon), lanes });
};
