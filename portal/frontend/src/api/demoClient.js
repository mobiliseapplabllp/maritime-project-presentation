/* Read-only in-browser backend for the published demo snapshot.
 * Serves the same { success, data, meta } envelope the axios client returns,
 * from src/demo/snapshot.json. All writes are politely refused. */
import snap from '../demo/snapshot.json';
import { answer, SUGGESTIONS } from '../ai/engine.js';

const D = snap.collections;
const DAY = 24 * 3600 * 1000;
const readBy = new Set();
const ackedInstruments = new Map();  // id -> extra acknowledgers
let currentUser = { id: 'demo', name: 'You (demo)' };
const ackedAlerts = new Set();
const delay = (r) => new Promise((res) => setTimeout(() => res(r), 200 + Math.random() * 350));

const clone = (x) => JSON.parse(JSON.stringify(x));
const byId = (coll) => { const m = new Map(); for (const r of coll) m.set(String(r._id), r); return m; };
const maps = {
  vessels: byId(D.vessels), berths: byId(D.berths), roles: byId(D.roles),
  portcalls: byId(D.portcalls), inspections: byId(D.inspections), invoices: byId(D.invoices),
  seafarers: byId(D.seafarers || []), instruments: byId(D.instruments || []),
  licenses: byId(D.licenses || []), incidents: byId(D.incidents || []),
};

const decorateSeafarer = (sf) => {
  const o = clone(sf);
  o.certificates = (o.certificates || []).map((c) => ({ ...c, status: certStatus(c.expiryDate) }))
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  o.certAlerts = o.certificates.filter((c) => c.status !== 'VALID').length;
  o.totalSeaDays = (o.seaService || []).reduce((s2, x) => s2 + Math.round((new Date(x.to) - new Date(x.from)) / 86400000), 0);
  return o;
};

// grounded assistant accessors over the snapshot (same engine as the backend)
const engineData = {
  kpis: async () => ({ ...snap.dashboard.kpis, openInspections: (D.inspections || []).filter((i) => i.status !== 'CLOSED').length }),
  vesselByName: async (name) => {
    const v = D.vessels.find((x) => x.name.toLowerCase().includes(name.toLowerCase()));
    if (!v) return null;
    const call = D.portcalls.find((c) => String(c.vessel) === String(v._id) && ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'].includes(c.status));
    const certAlertList = (v.certificates || []).map((c) => ({ ...c, st: certStatus(c.expiryDate) })).filter((c) => c.st !== 'VALID');
    let situation = 'No active call — last known from movement history.';
    if (call) {
      const b = call.berth && maps.berths.get(String(call.berth));
      situation = call.status === 'BERTHED' ? `Currently **berthed at ${b ? b.code : '—'}** (call ${call.vcn}).`
        : call.status === 'AT_ANCHORAGE' ? `At **anchorage** awaiting berth (call ${call.vcn}).`
          : `Inbound — call ${call.vcn} is ${call.status.toLowerCase()}, ETA ${String(call.eta).slice(0, 16).replace('T', ' ')}.`;
    }
    return { id: v._id, name: v.name, imo: v.imo, type: v.type, flag: v.flag, situation,
      certAlert: certAlertList.length ? `${certAlertList.length} certificate issue(s): ${certAlertList.map((c) => `${c.certType} ${c.st}`).join(', ')}` : '' };
  },
  portCallByVcn: async (vcn) => {
    const c = D.portcalls.find((x) => x.vcn === vcn);
    if (!c) return null;
    const b = c.berth && maps.berths.get(String(c.berth));
    return { id: c._id, vcn: c.vcn, vesselName: maps.vessels.get(String(c.vessel))?.name, status: c.status,
      berthCode: b && b.code, eta: c.eta, atb: c.atb, atd: c.atd, agentName: c.agentName,
      cargoSummary: (c.cargoOps || []).map((o) => `${o.operation.toLowerCase()} ${new Intl.NumberFormat('en-IN').format(o.qty)} ${o.unit} ${o.cargoType}`).join('; ') };
  },
  berthBoard: async () => snap.dashboard.berthBoard.map((b) => ({ code: b.code, vessel: b.occupiedBy?.vessel, etd: b.occupiedBy?.etd })),
  arrivals: async () => snap.dashboard.arrivals.map((a) => ({ vcn: a.vcn, vessel: a.vessel, status: a.status, eta: a.eta })),
  expiringCerts: async () => D.vessels.filter((v) => v.status === 'ACTIVE').flatMap((v) => (v.certificates || [])
    .map((c) => ({ vessel: v.name, certType: c.certType, expiryDate: c.expiryDate, status: certStatus(c.expiryDate) }))
    .filter((c) => c.status !== 'VALID')).sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)),
  riskTop: async (n) => (snap.risk?.scores || []).slice(0, n).map((r) => ({
    name: r.name, score: r.score, band: r.band,
    topFactor: r.factors[0] ? `${r.factors[0].label}: ${r.factors[0].evidence}` : '' })),
  openIncidents: async () => (D.incidents || []).filter((i) => i.status !== 'CLOSED')
    .map((i) => ({ number: i.number, type: i.type, severity: i.severity, title: i.title, status: i.status })),
  invoicesSummary: async () => {
    const now = new Date(); const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const inv = D.invoices; const outstanding = inv.filter((i) => i.status === 'ISSUED');
    return {
      mtd: inv.filter((i) => i.issuedAt && new Date(i.issuedAt) >= startMonth && ['ISSUED', 'PAID'].includes(i.status)).reduce((s2, i) => s2 + i.total, 0),
      outstanding: outstanding.reduce((s2, i) => s2 + i.total, 0), outstandingCount: outstanding.length,
      drafts: inv.filter((i) => i.status === 'DRAFT').length,
      collectedMtd: inv.filter((i) => i.paidAt && new Date(i.paidAt) >= startMonth).reduce((s2, i) => s2 + i.total, 0),
    };
  },
  instrumentsLatest: async () => (D.instruments || []).filter((i) => i.status === 'IN_FORCE')
    .sort((a, b) => new Date(b.issuedDate) - new Date(a.issuedDate)).slice(0, 5)
    .map((i) => ({ refNo: i.refNo, title: i.title, ackRequired: i.ackRequired })),
};

const certStatus = (expiry) => {
  const exp = new Date(expiry).getTime(); const t = Date.now();
  if (exp < t) return 'EXPIRED';
  if (exp <= t + 30 * DAY) return 'EXPIRING';
  return 'VALID';
};

const pickFields = (row, fields) => {
  if (!row) return null;
  if (!fields) return clone(row);
  const o = { _id: row._id };
  for (const f of fields) o[f] = row[f];
  return o;
};

const cmp = (a, b) => {
  if (a === b) return 0;
  if (a === undefined || a === null) return -1;
  if (b === undefined || b === null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : 1;
};

function listOf(coll, params = {}, cfg = {}) {
  let rows = coll.slice();
  for (const f of cfg.filters || []) {
    const v = params[f];
    if (v !== undefined && v !== '') rows = rows.filter((r) => String(r[f]) === String(v));
  }
  if (params.active === 'true') rows = rows.filter((r) => r.active !== false);
  if (params.active === 'false') rows = rows.filter((r) => r.active === false);
  if (params.q && cfg.search) {
    const q = String(params.q).toLowerCase();
    rows = rows.filter((r) => cfg.search.some((f) => String(r[f] ?? '').toLowerCase().includes(q)));
  }
  const sort = params.sort || cfg.sort || '-createdAt';
  const key = sort.replace(/^-/, ''); const dir = sort.startsWith('-') ? -1 : 1;
  rows.sort((a, b) => dir * cmp(a[key], b[key]));
  const total = rows.length;
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(100, parseInt(params.limit, 10) || 20);
  rows = rows.slice((page - 1) * limit, page * limit).map(clone);
  if (cfg.decorate) rows = rows.map(cfg.decorate);
  return { data: rows, meta: { total, page, limit } };
}

const popCall = (c) => ({
  ...c,
  vessel: pickFields(maps.vessels.get(String(c.vessel)), ['name', 'imo', 'type', 'flag']),
  berth: c.berth ? pickFields(maps.berths.get(String(c.berth)), ['code', 'name', 'terminal']) : null,
});

const LISTS = {
  '/vessels': (p) => listOf(D.vessels, p, { search: ['name', 'imo', 'callSign'], filters: ['type', 'flag', 'status', 'agent'], sort: 'name' }),
  '/port-calls': (p) => listOf(D.portcalls, p, { search: ['vcn'], filters: ['status', 'berth', 'vessel', 'agentCode'], sort: '-eta', decorate: popCall }),
  '/inspections': (p) => listOf(D.inspections, p, {
    search: ['number', 'inspector'], filters: ['status', 'type', 'vessel', 'result'], sort: '-plannedAt',
    decorate: (i) => ({ ...i, vessel: pickFields(maps.vessels.get(String(i.vessel)), ['name', 'imo', 'flag']) }),
  }),
  '/invoices': (p) => listOf(D.invoices, p, {
    search: ['number'], filters: ['status', 'vessel'],
    decorate: (i) => ({
      ...i,
      vessel: pickFields(maps.vessels.get(String(i.vessel)), ['name', 'imo']),
      portCall: pickFields(maps.portcalls.get(String(i.portCall)), ['vcn']),
    }),
  }),
  '/berths': (p) => listOf(D.berths, p, { search: ['code', 'name', 'terminal'], filters: ['terminal', 'berthType', 'status'], sort: 'code' }),
  '/lookups': (p) => listOf(D.lookups, p, { search: ['code', 'label'], filters: ['category'], sort: 'code' }),
  '/tariffs': (p) => listOf(D.tariffs, p, { search: ['code', 'name'], filters: ['category'], sort: 'code' }),
  '/checklist-templates': (p) => listOf(D.templates, p, { search: ['name'], filters: ['inspectionType'], sort: 'name' }),
  '/users': (p) => listOf(D.users, p, {
    search: ['name', 'email', 'designation'], filters: ['role'], sort: 'name',
    decorate: (u) => ({ ...u, role: pickFields(maps.roles.get(String(u.role)), ['name']) }),
  }),
  '/audit': (p) => listOf(D.audit, p, { search: ['entityLabel'], filters: ['entity', 'action'], sort: '-at' }),
  '/seafarers': (p) => listOf((D.seafarers || []).map(decorateSeafarer), p, { search: ['name', 'cdcNo', 'indosNo'], filters: ['rank', 'status', 'nationality'], sort: 'name' }),
  '/instruments': (p) => listOf((D.instruments || []).map((i) => ({ ...i, acknowledgedBy: [...(i.acknowledgedBy || []), ...(ackedInstruments.get(String(i._id)) || [])] })), p, { search: ['refNo', 'title', 'summary'], filters: ['type', 'category', 'status'], sort: '-issuedDate' }),
  '/licenses': (p) => listOf(D.licenses || [], p, { search: ['licenseNo', 'entityName'], filters: ['entityType', 'status'] }),
  '/incidents': (p) => listOf((D.incidents || []).map((i) => ({ ...i, vessel: i.vessel ? pickFields(maps.vessels.get(String(i.vessel)), ['name', 'imo']) : null })), p, { search: ['number', 'title', 'vesselName'], filters: ['status', 'type', 'severity'], sort: '-reportedAt' }),
};

function detail(url) {
  let m;
  if ((m = url.match(/^\/vessels\/([a-f0-9]{24})$/))) {
    const v = clone(maps.vessels.get(m[1]));
    if (!v) throw new Error('Vessel not found');
    v.certificates = (v.certificates || []).map((c) => ({ ...c, status: certStatus(c.expiryDate) }))
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    v.recentCalls = D.portcalls.filter((c) => String(c.vessel) === m[1])
      .sort((a, b) => new Date(b.eta) - new Date(a.eta)).slice(0, 15)
      .map((c) => ({ ...clone(c), berth: c.berth ? pickFields(maps.berths.get(String(c.berth)), ['code', 'name']) : null }));
    v.recentInspections = D.inspections.filter((i) => String(i.vessel) === m[1])
      .sort((a, b) => new Date(b.plannedAt) - new Date(a.plannedAt)).slice(0, 10).map(clone);
    return v;
  }
  if ((m = url.match(/^\/port-calls\/([a-f0-9]{24})$/))) {
    const c = maps.portcalls.get(m[1]);
    if (!c) throw new Error('Port call not found');
    return { ...clone(c), vessel: clone(maps.vessels.get(String(c.vessel))),
      berth: c.berth ? pickFields(maps.berths.get(String(c.berth)), ['code', 'name', 'terminal', 'berthType']) : null };
  }
  if ((m = url.match(/^\/inspections\/([a-f0-9]{24})$/))) {
    const i = maps.inspections.get(m[1]);
    if (!i) throw new Error('Inspection not found');
    return { ...clone(i), vessel: pickFields(maps.vessels.get(String(i.vessel)), ['name', 'imo', 'flag', 'type']),
      portCall: i.portCall ? pickFields(maps.portcalls.get(String(i.portCall)), ['vcn', 'berth', 'status']) : null };
  }
  if ((m = url.match(/^\/invoices\/([a-f0-9]{24})$/))) {
    const i = maps.invoices.get(m[1]);
    if (!i) throw new Error('Invoice not found');
    return { ...clone(i), vessel: pickFields(maps.vessels.get(String(i.vessel)), ['name', 'imo', 'flag', 'grt']),
      portCall: pickFields(maps.portcalls.get(String(i.portCall)), ['vcn', 'eta', 'atd', 'agentName']) };
  }
  if ((m = url.match(/^\/seafarers\/([a-f0-9]{24})$/))) {
    const sf = maps.seafarers.get(m[1]);
    if (!sf) throw new Error('Seafarer not found');
    const o = decorateSeafarer(sf);
    o.currentVessel = sf.currentVessel ? pickFields(maps.vessels.get(String(sf.currentVessel)), ['name', 'imo']) : null;
    return o;
  }
  if ((m = url.match(/^\/licenses\/([a-f0-9]{24})$/))) {
    const l = maps.licenses.get(m[1]);
    if (!l) throw new Error('Licence not found');
    return clone(l);
  }
  if ((m = url.match(/^\/instruments\/([a-f0-9]{24})$/))) {
    const ins = maps.instruments.get(m[1]);
    if (!ins) throw new Error('Instrument not found');
    return { ...clone(ins), acknowledgedBy: [...(ins.acknowledgedBy || []), ...(ackedInstruments.get(m[1]) || [])] };
  }
  if ((m = url.match(/^\/incidents\/([a-f0-9]{24})$/))) {
    const inc = maps.incidents.get(m[1]);
    if (!inc) throw new Error('Incident not found');
    return { ...clone(inc), vessel: inc.vessel ? pickFields(maps.vessels.get(String(inc.vessel)), ['name', 'imo', 'type', 'flag']) : null };
  }
  return undefined;
}

const READ_ONLY = 'Read-only demo — CRUD, workflow transitions and billing run in the full portal (see the repository README)';

const demo = {
  async get(url, config = {}) {
    await delay();
    const params = (config && config.params) || {};
    if (url === '/risk/scores') return { success: true, data: clone(snap.risk?.scores || []), meta: { weights: snap.risk?.weights, computedAt: snap.generatedAt } };
    if (url === '/risk/targeting') return { success: true, data: clone(snap.risk?.targeting || []), meta: {} };
    if (url === '/risk/weights') return { success: true, data: clone(snap.risk?.weights || {}) };
    if (url === '/tracking') {
      const pic = clone(snap.tracking || { positions: [], alerts: [] });
      pic.alerts = pic.alerts.filter((a) => !ackedAlerts.has(String(a._id)));
      return { success: true, data: pic };
    }
    if (url === '/ai/suggestions') return { success: true, data: SUGGESTIONS };
    if (url === '/meta') return { success: true, data: { org: snap.org, ...snap.meta } };
    if (url === '/dashboard') return { success: true, data: clone(snap.dashboard) };
    if (url === '/settings') return { success: true, data: clone(snap.org) };
    if (url === '/roles') {
      const counts = D.users.reduce((mm, u) => { const k = String(u.role); mm[k] = (mm[k] || 0) + 1; return mm; }, {});
      return { success: true, data: D.roles.map((r) => ({ ...clone(r), userCount: counts[String(r._id)] || 0 })) };
    }
    if (url === '/notifications') {
      const items = D.notifications.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map((n) => ({ ...clone(n), read: readBy.has(String(n._id)) }));
      return { success: true, data: items, meta: { unread: items.filter((n) => !n.read).length } };
    }
    if (url === '/vessels/certificates/all') {
      let rows = D.vessels.filter((v) => v.status === 'ACTIVE').flatMap((v) => (v.certificates || []).map((c) => ({
        vesselId: v._id, vesselName: v.name, imo: v.imo, certId: c._id, certType: c.certType,
        number: c.number, issuer: c.issuer, issueDate: c.issueDate, expiryDate: c.expiryDate, status: certStatus(c.expiryDate),
      })));
      if (params.status) rows = rows.filter((r) => r.status === params.status);
      if (params.q) {
        const q = String(params.q).toLowerCase();
        rows = rows.filter((r) => [r.vesselName, r.certType, r.number].some((x) => String(x || '').toLowerCase().includes(q)));
      }
      rows.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
      const total = rows.length;
      const page = Math.max(1, parseInt(params.page, 10) || 1);
      const limit = Math.min(100, parseInt(params.limit, 10) || 25);
      return { success: true, data: rows.slice((page - 1) * limit, page * limit), meta: { total, page, limit } };
    }
    const d = detail(url);
    if (d !== undefined) return { success: true, data: d };
    if (LISTS[url]) { const r = LISTS[url](params); return { success: true, ...r }; }
    throw new Error(`Not in the demo snapshot: ${url}`);
  },

  async post(url, body = {}) {
    await delay();
    let m;
    if (url === '/auth/login') {
      const user = D.users.find((u) => u.email === String(body.email || '').toLowerCase().trim());
      if (!user || body.password !== 'Mundra@2026') throw new Error('Incorrect email or password');
      const role = maps.roles.get(String(user.role));
      currentUser = { id: String(user._id), name: user.name };
      return { success: true, data: {
        user: { ...clone(user), role: { _id: role._id, name: role.name }, perms: role.permissions },
        token: 'demo-token', refreshToken: 'demo-refresh',
      } };
    }
    if (url === '/auth/refresh') throw new Error('Session expired — sign in again');
    if (url === '/ai/chat') {
      await delay();
      const grounded = await answer({ message: body.message, data: engineData });
      return { success: true, data: { ...grounded, engine: 'grounded demo engine (in-browser)' } };
    }
    if ((m = url.match(/^\/instruments\/([a-f0-9]{24})\/acknowledge$/))) {
      const cur = ackedInstruments.get(m[1]) || [];
      if (!cur.length) ackedInstruments.set(m[1], [{ userId: currentUser.id, name: currentUser.name, at: new Date().toISOString() }]);
      return { success: true, data: await this.get(`/instruments/${m[1]}`).then((r) => r.data) };
    }
    if ((m = url.match(/^\/tracking\/alerts\/([a-f0-9]{24})\/ack$/))) { ackedAlerts.add(m[1]); return { success: true, data: { acknowledged: true } }; }
    if ((m = url.match(/^\/notifications\/([a-f0-9]{24})\/read$/))) { readBy.add(m[1]); return { success: true, data: { read: true } }; }
    if (url === '/notifications/read-all') { D.notifications.forEach((n) => readBy.add(String(n._id))); return { success: true, data: { read: true } }; }
    throw new Error(READ_ONLY);
  },
  async put() { throw new Error(READ_ONLY); },
  async delete() { throw new Error(READ_ONLY); },
};

export default demo;
