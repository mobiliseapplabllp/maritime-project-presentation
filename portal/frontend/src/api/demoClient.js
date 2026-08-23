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

/* ---- per-page stat cards + MIS report (mirrors the backend controllers over the snapshot) ---- */
const HOUR = 3600 * 1000;
const card = (label, value, sub, tone) => ({ label, value, sub: sub || '', tone: tone || 'default' });
const inr = (n) => {
  const abs = Math.abs(n || 0);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${new Intl.NumberFormat('en-IN').format(Math.round(n || 0))}`;
};

function statsFor(scope) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  switch (scope) {
    case 'portcalls': {
      const active = D.portcalls.filter((c) => ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'].includes(c.status));
      const sailed30 = D.portcalls.filter((c) => c.status === 'SAILED' && c.atd && c.ata && now - new Date(c.atd) <= 30 * DAY);
      const turn = sailed30.length ? Math.round((sailed30.reduce((s, c) => s + (new Date(c.atd) - new Date(c.ata)), 0) / sailed30.length / HOUR) * 10) / 10 : 0;
      return [
        card('At berth', active.filter((c) => c.status === 'BERTHED').length, 'working cargo now', 'success'),
        card('At anchorage', active.filter((c) => c.status === 'AT_ANCHORAGE').length, 'awaiting berth', 'warning'),
        card('Expected 72 h', active.filter((c) => ['ANNOUNCED', 'CONFIRMED'].includes(c.status) && new Date(c.eta) > now && new Date(c.eta) < new Date(now.getTime() + 72 * HOUR)).length, 'announced + confirmed'),
        card('Avg turnaround', `${turn} h`, 'sailed calls, 30 days'),
      ];
    }
    case 'berths': {
      const op = D.berths.filter((b) => b.status === 'OPERATIONAL');
      const occ = new Set(D.portcalls.filter((c) => c.status === 'BERTHED').map((c) => String(c.berth))).size;
      return [
        card('Berths', D.berths.length, `${D.berths.length - op.length} under maintenance`),
        card('Occupied now', occ, 'vessels alongside', 'success'),
        card('Occupancy', `${op.length ? Math.round((occ / op.length) * 100) : 0}%`, 'of operational berths'),
        card('Free & operational', op.length - occ, 'ready for allocation'),
      ];
    }
    case 'vessels': {
      const active = D.vessels.filter((v) => v.status === 'ACTIVE');
      const alerts = active.filter((v) => (v.certificates || []).some((c) => certStatus(c.expiryDate) !== 'VALID')).length;
      const avgAge = active.length ? Math.round(active.reduce((s, v) => s + (now.getFullYear() - (v.built || now.getFullYear())), 0) / active.length) : 0;
      return [
        card('Active vessels', active.length, `${D.vessels.length - active.length} inactive`),
        card('Certificate alerts', alerts, 'vessels needing review', alerts ? 'warning' : 'success'),
        card('Average age', `${avgAge} yrs`, 'active fleet'),
        card('Vessel types', new Set(active.map((v) => v.type)).size, 'in the registry'),
      ];
    }
    case 'certificates': {
      const all = D.vessels.filter((v) => v.status === 'ACTIVE').flatMap((v) => (v.certificates || []).map((c) => certStatus(c.expiryDate)));
      return [
        card('Certificates', all.length, 'across active fleet'),
        card('Valid', all.filter((x) => x === 'VALID').length, '', 'success'),
        card('Expiring ≤30 d', all.filter((x) => x === 'EXPIRING').length, 'plan renewals', 'warning'),
        card('Expired', all.filter((x) => x === 'EXPIRED').length, 'immediate action', 'error'),
      ];
    }
    case 'seafarers': {
      const sf = D.seafarers || [];
      const alerts = sf.filter((x) => (x.certificates || []).some((c) => certStatus(c.expiryDate) !== 'VALID')).length;
      const avgDays = sf.length ? Math.round(sf.reduce((s, x) => s + (x.seaService || []).reduce((a, y) => a + (new Date(y.to) - new Date(y.from)) / DAY, 0), 0) / sf.length) : 0;
      return [
        card('Registered', sf.length, 'seafarers on the roll'),
        card('On board', sf.filter((x) => x.currentVessel).length, 'currently assigned', 'success'),
        card('Certificate alerts', alerts, 'medical / STCW review', alerts ? 'warning' : 'success'),
        card('Avg sea service', `${new Intl.NumberFormat('en-IN').format(avgDays)} d`, 'per seafarer'),
      ];
    }
    case 'legislation': {
      const ins = (D.instruments || []).map((i) => ({ ...i, acknowledgedBy: [...(i.acknowledgedBy || []), ...(ackedInstruments.get(String(i._id)) || [])] }));
      const pendingMine = ins.filter((i) => i.ackRequired && i.status === 'IN_FORCE' && !i.acknowledgedBy.some((a) => String(a.userId) === String(currentUser.id))).length;
      return [
        card('In force', ins.filter((i) => i.status === 'IN_FORCE').length, 'instruments'),
        card('Issued this year', ins.filter((i) => i.issuedDate && new Date(i.issuedDate) >= yearStart).length, 'circulars & notices'),
        card('Need acknowledgment', ins.filter((i) => i.ackRequired && i.status === 'IN_FORCE').length, 'organisation-wide'),
        card('Pending — you', pendingMine, 'awaiting your acknowledgment', pendingMine ? 'warning' : 'success'),
      ];
    }
    case 'facilities': {
      const lic = D.licenses || [];
      const soon = lic.filter((l) => l.status === 'ISSUED' && l.expiryDate && new Date(l.expiryDate) < new Date(now.getTime() + 90 * DAY)).length;
      return [
        card('Issued', lic.filter((l) => l.status === 'ISSUED').length, 'active licences', 'success'),
        card('In pipeline', lic.filter((l) => ['APPLIED', 'UNDER_REVIEW'].includes(l.status)).length, 'applied / under review'),
        card('Suspended / revoked', lic.filter((l) => ['SUSPENDED', 'REVOKED'].includes(l.status)).length, 'enforcement actions', 'warning'),
        card('Expiring ≤90 d', soon, 'renewals due', soon ? 'warning' : 'success'),
      ];
    }
    case 'inspections': {
      const openF = D.inspections.reduce((s, i) => s + (i.findings || []).filter((f) => f.status === 'OPEN').length, 0);
      return [
        card('Open inspections', D.inspections.filter((i) => i.status !== 'CLOSED').length, 'planned + in progress'),
        card('Closed this month', D.inspections.filter((i) => i.closedAt && new Date(i.closedAt) >= monthStart).length, ''),
        card('Open findings', openF, 'deficiencies to rectify', openF ? 'warning' : 'success'),
        card('Detentions YTD', D.inspections.filter((i) => i.detention && i.closedAt && new Date(i.closedAt) >= yearStart).length, '', 'error'),
      ];
    }
    case 'incidents': {
      const inc = D.incidents || [];
      return [
        card('Open', inc.filter((i) => i.status === 'OPEN').length, 'awaiting response', 'error'),
        card('Responding', inc.filter((i) => i.status === 'RESPONDING').length, 'assets tasked', 'warning'),
        card('Closed this month', inc.filter((i) => i.closedAt && new Date(i.closedAt) >= monthStart).length, '', 'success'),
        card('High severity YTD', inc.filter((i) => ['HIGH', 'CRITICAL'].includes(i.severity) && new Date(i.reportedAt) >= yearStart).length, 'high + critical'),
      ];
    }
    case 'invoices': {
      const out = D.invoices.filter((i) => i.status === 'ISSUED');
      const overdue = out.filter((i) => i.issuedAt && now - new Date(i.issuedAt) > 30 * DAY);
      return [
        card('Outstanding', inr(out.reduce((s, i) => s + i.total, 0)), `${out.length} issued invoices`, 'warning'),
        card('Overdue >30 d', overdue.length, inr(overdue.reduce((s, i) => s + i.total, 0)), overdue.length ? 'error' : 'success'),
        card('Drafts', D.invoices.filter((i) => i.status === 'DRAFT').length, 'awaiting issue'),
        card('Collected MTD', inr(D.invoices.filter((i) => i.paidAt && new Date(i.paidAt) >= monthStart).reduce((s, i) => s + i.total, 0)), '', 'success'),
      ];
    }
    case 'risk': {
      const rows = snap.risk?.scores || [];
      const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;
      return [
        card('High risk', rows.filter((r) => r.band === 'HIGH').length, 'priority targets', 'error'),
        card('Medium risk', rows.filter((r) => r.band === 'MEDIUM').length, '', 'warning'),
        card('Low risk', rows.filter((r) => r.band === 'LOW').length, '', 'success'),
        card('Fleet average', avg, 'score across active fleet'),
      ];
    }
    case 'masters':
      return [
        card('Berths', D.berths.length),
        card('Lookup entries', D.lookups.length),
        card('Active tariffs', D.tariffs.filter((t) => t.active !== false).length),
        card('Checklist templates', D.templates.length),
      ];
    case 'users':
      return [
        card('Users', D.users.length, 'accounts'),
        card('Active', D.users.filter((u) => u.active).length, '', 'success'),
        card('Disabled', D.users.filter((u) => !u.active).length, ''),
        card('Signed in ≤7 d', D.users.filter((u) => u.lastLoginAt && now - new Date(u.lastLoginAt) < 7 * DAY).length, 'recent activity'),
      ];
    default:
      return null;
  }
}

function misReport(params = {}) {
  const to = params.to ? new Date(`${params.to}T23:59:59`) : new Date();
  const from = params.from ? new Date(params.from) : new Date(to.getFullYear(), to.getMonth() - 11, 1);
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = (d) => d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
  const GROUP_OF = { CONTAINERS: 'container', COAL: 'dryBulk', FERT: 'dryBulk', GRAIN: 'dryBulk', CRUDE: 'liquid', POL: 'liquid', EDIBLE: 'liquid' };

  const months = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= to && months.length < 36) { months.push({ key: monthKey(cur), month: monthLabel(cur) }); cur.setMonth(cur.getMonth() + 1); }
  const byMonth = months.map((mm) => ({ ...mm, container: 0, dryBulk: 0, liquid: 0, other: 0, total: 0, teu: 0, calls: 0 }));
  const commodity = {}; const byTerminal = {}; const byVesselType = {};
  let turnSum = 0, turnN = 0, waitSum = 0;
  const sailed = D.portcalls.filter((c) => c.status === 'SAILED' && c.atd && new Date(c.atd) >= from && new Date(c.atd) <= to);
  for (const c of sailed) {
    const row = byMonth.find((r) => r.key === monthKey(new Date(c.atd)));
    if (row) row.calls += 1;
    if (c.ata && c.atd) { turnSum += (new Date(c.atd) - new Date(c.ata)) / HOUR; turnN += 1; }
    if (c.ata && c.atb) waitSum += (new Date(c.atb) - new Date(c.ata)) / HOUR;
    const berth = c.berth && maps.berths.get(String(c.berth));
    const term = (berth && berth.terminal) || 'Unassigned';
    byTerminal[term] = byTerminal[term] || { terminal: term, calls: 0, mt: 0 };
    byTerminal[term].calls += 1;
    const vt = maps.vessels.get(String(c.vessel))?.type || 'OTHER';
    byVesselType[vt] = (byVesselType[vt] || 0) + 1;
    for (const o of c.cargoOps || []) {
      const mt = o.qtyMT || 0;
      const grp = GROUP_OF[o.cargoType] || 'other';
      if (row) { row[grp] += mt; row.total += mt; if (o.unit === 'TEU') row.teu += o.qty; }
      commodity[o.cargoType] = (commodity[o.cargoType] || 0) + mt;
      byTerminal[term].mt += mt;
    }
  }

  const revMonth = months.map((mm) => ({ ...mm, billed: 0, collected: 0 }));
  const byHead = {};
  let billed = 0, collected = 0;
  for (const i of D.invoices) {
    const issuedAt = i.issuedAt && new Date(i.issuedAt);
    const paidAt = i.paidAt && new Date(i.paidAt);
    if (issuedAt && issuedAt >= from && issuedAt <= to && ['ISSUED', 'PAID'].includes(i.status)) {
      billed += i.total;
      const r = revMonth.find((x) => x.key === monthKey(issuedAt));
      if (r) r.billed += i.total;
      for (const l of i.lines || []) {
        byHead[l.code] = byHead[l.code] || { code: l.code, name: l.description.split(' — ')[0], amount: 0 };
        byHead[l.code].amount += l.amount;
      }
    }
    if (paidAt && paidAt >= from && paidAt <= to) {
      collected += i.total;
      const r = revMonth.find((x) => x.key === monthKey(paidAt));
      if (r) r.collected += i.total;
    }
  }

  const inspections = D.inspections.filter((i) => i.closedAt && new Date(i.closedAt) >= from && new Date(i.closedAt) <= to);
  const insByType = {}; const insByResult = {}; const defCount = {};
  let detentions = 0;
  for (const i of inspections) {
    insByType[i.type] = (insByType[i.type] || 0) + 1;
    if (i.result) insByResult[i.result] = (insByResult[i.result] || 0) + 1;
    if (i.detention) detentions += 1;
    for (const f of i.findings || []) defCount[f.deficiencyCode] = (defCount[f.deficiencyCode] || 0) + 1;
  }
  const defLabel = Object.fromEntries(D.lookups.filter((l) => l.category === 'deficiencyCode').map((d) => [d.code, d.label]));
  const vesselCertStates = D.vessels.filter((v) => v.status === 'ACTIVE').flatMap((v) => (v.certificates || []).map((c) => certStatus(c.expiryDate)));
  const seafarerCertStates = (D.seafarers || []).flatMap((v) => (v.certificates || []).map((c) => certStatus(c.expiryDate)));
  const licenses = D.licenses || [];

  return {
    range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    cargo: {
      byMonth: byMonth.map(({ key, ...r }) => r),
      byCommodity: Object.entries(commodity).map(([name, mt]) => ({ name, mt })).sort((a, b) => b.mt - a.mt),
      totalMT: Object.values(commodity).reduce((s, x) => s + x, 0),
      totalTEU: byMonth.reduce((s, r) => s + r.teu, 0),
      calls: sailed.length,
      avgTurnaroundHrs: turnN ? Math.round((turnSum / turnN) * 10) / 10 : 0,
      avgWaitingHrs: turnN ? Math.round((waitSum / turnN) * 10) / 10 : 0,
    },
    traffic: {
      byTerminal: Object.values(byTerminal).sort((a, b) => b.mt - a.mt),
      byVesselType: Object.entries(byVesselType).map(([type, calls]) => ({ type, calls })).sort((a, b) => b.calls - a.calls),
      operationalBerths: D.berths.filter((b) => b.status === 'OPERATIONAL').length,
    },
    revenue: {
      byMonth: revMonth.map(({ key, ...r }) => r),
      byHead: Object.values(byHead).sort((a, b) => b.amount - a.amount),
      billed, collected,
      outstanding: D.invoices.filter((i) => i.status === 'ISSUED').reduce((s, i) => s + i.total, 0),
    },
    compliance: {
      inspections: inspections.length,
      byType: Object.entries(insByType).map(([type, count]) => ({ type, count })),
      byResult: Object.entries(insByResult).map(([result, count]) => ({ result, count })),
      topDeficiencies: Object.entries(defCount).map(([code, count]) => ({ code, label: defLabel[code] || code, count })).sort((a, b) => b.count - a.count).slice(0, 8),
      detentions,
      vesselCerts: { expired: vesselCertStates.filter((x) => x === 'EXPIRED').length, expiring: vesselCertStates.filter((x) => x === 'EXPIRING').length },
      seafarerCerts: { expired: seafarerCertStates.filter((x) => x === 'EXPIRED').length, expiring: seafarerCertStates.filter((x) => x === 'EXPIRING').length },
    },
    licensing: {
      byStatus: ['ISSUED', 'UNDER_REVIEW', 'APPLIED', 'SUSPENDED', 'REVOKED', 'REJECTED']
        .map((status) => ({ status, count: licenses.filter((l) => l.status === status).length })).filter((x) => x.count),
      expiring90: licenses.filter((l) => l.status === 'ISSUED' && l.expiryDate && new Date(l.expiryDate) < new Date(Date.now() + 90 * DAY)).length,
    },
  };
}

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
    if (url.startsWith('/stats/')) {
      const cards = statsFor(url.slice('/stats/'.length));
      if (cards) return { success: true, data: { cards } };
    }
    if (url === '/reports/mis') return { success: true, data: misReport(params) };
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
