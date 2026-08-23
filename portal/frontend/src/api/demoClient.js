/* Read-only in-browser backend for the published demo snapshot.
 * Serves the same { success, data, meta } envelope the axios client returns,
 * from src/demo/snapshot.json. All writes are politely refused. */
import snap from '../demo/snapshot.json';

const D = snap.collections;
const DAY = 24 * 3600 * 1000;
const readBy = new Set();

const clone = (x) => JSON.parse(JSON.stringify(x));
const byId = (coll) => { const m = new Map(); for (const r of coll) m.set(String(r._id), r); return m; };
const maps = {
  vessels: byId(D.vessels), berths: byId(D.berths), roles: byId(D.roles),
  portcalls: byId(D.portcalls), inspections: byId(D.inspections), invoices: byId(D.invoices),
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
  return undefined;
}

const READ_ONLY = 'Read-only demo — CRUD, workflow transitions and billing run in the full portal (see the repository README)';

const demo = {
  async get(url, config = {}) {
    const params = (config && config.params) || {};
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
    if (url === '/auth/login') {
      const user = D.users.find((u) => u.email === String(body.email || '').toLowerCase().trim());
      if (!user || body.password !== 'Mundra@2026') throw new Error('Incorrect email or password');
      const role = maps.roles.get(String(user.role));
      return { success: true, data: {
        user: { ...clone(user), role: { _id: role._id, name: role.name }, perms: role.permissions },
        token: 'demo-token', refreshToken: 'demo-refresh',
      } };
    }
    if (url === '/auth/refresh') throw new Error('Session expired — sign in again');
    let m;
    if ((m = url.match(/^\/notifications\/([a-f0-9]{24})\/read$/))) { readBy.add(m[1]); return { success: true, data: { read: true } }; }
    if (url === '/notifications/read-all') { D.notifications.forEach((n) => readBy.add(String(n._id))); return { success: true, data: { read: true } }; }
    throw new Error(READ_ONLY);
  },
  async put() { throw new Error(READ_ONLY); },
  async delete() { throw new Error(READ_ONLY); },
};

export default demo;
