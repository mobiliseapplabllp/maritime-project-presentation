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
        card('Open / unacknowledged', inc.filter((i) => ['OPEN', 'ACKNOWLEDGED'].includes(i.status)).length, 'awaiting response', 'error'),
        card('In response', inc.filter((i) => ['RESPONDING', 'MONITORING'].includes(i.status)).length, 'assets tasked', 'warning'),
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
  let from = params.from ? new Date(params.from) : new Date(to.getFullYear(), to.getMonth() - 11, 1);
  // scaffold caps at 60 months anchored to `to` — over-long ranges keep their
  // newest months and the query window clamps with it (mirrors the live API)
  if ((to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) >= 60) {
    from = new Date(to.getFullYear(), to.getMonth() - 59, 1);
  }
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = (d) => d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
  const GROUP_OF = { CONTAINERS: 'container', COAL: 'dryBulk', FERT: 'dryBulk', GRAIN: 'dryBulk', CRUDE: 'liquid', POL: 'liquid', EDIBLE: 'liquid' };

  const months = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= to && months.length < 60) { months.push({ key: monthKey(cur), month: monthLabel(cur) }); cur.setMonth(cur.getMonth() + 1); }
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
  '/incidents': (p) => listOf((D.incidents || []).map(({ comms, documents, log, statusHistory, tasks, ...i }) => ({
    ...i,
    vessel: i.vessel ? pickFields(maps.vessels.get(String(i.vessel)), ['name', 'imo']) : null,
    berth: i.berth ? pickFields(maps.berths.get(String(i.berth)), ['code', 'terminal']) : null,
  })), p, { search: ['number', 'title', 'vesselName', 'reportedBy'], filters: ['status', 'type', 'severity', 'category', 'priority'], sort: '-reportedAt' }),
  '/companies': (p) => listOf(D.companies || [], p, { search: ['code', 'name', 'contactPerson', 'gstin'], filters: ['category', 'status', 'city'], sort: 'name' }),
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
    v.recentIncidents = (D.incidents || []).filter((i) => String(i.vessel) === m[1])
      .sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt)).slice(0, 12)
      .map(({ number, title, type, severity, status, reportedAt, closedAt, _id }) => ({ _id, number, title, type, severity, status, reportedAt, closedAt }));
    v.crewOnBoard = (D.seafarers || []).filter((s2) => String(s2.currentVessel) === m[1]).map((s2) => ({
      _id: s2._id, name: s2.name, rank: s2.rank, cdcNo: s2.cdcNo, nationality: s2.nationality, status: s2.status,
      certAlerts: (s2.certificates || []).filter((c) => certStatus(c.expiryDate) !== 'VALID').length,
    }));
    const lp = (snap.tracking?.positions || []).find((p2) => String(p2.vessel?._id) === m[1]);
    v.lastPosition = lp ? { lat: lp.lat, lon: lp.lon, course: lp.course, speed: lp.speed, navStatus: lp.navStatus, receivedAt: lp.receivedAt } : null;
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
    return { ...clone(inc),
      vessel: inc.vessel ? pickFields(maps.vessels.get(String(inc.vessel)), ['name', 'imo', 'type', 'flag']) : null,
      berth: inc.berth ? pickFields(maps.berths.get(String(inc.berth)), ['code', 'name', 'terminal']) : null };
  }
  if ((m = url.match(/^\/companies\/([a-f0-9]{24})$/))) {
    const co = (D.companies || []).find((x) => String(x._id) === m[1]);
    if (!co) throw new Error('Company not found');
    return { ...clone(co),
      licences: (D.licenses || []).filter((l) => l.entityName === co.name).sort((a, b) => new Date(b.appliedDate) - new Date(a.appliedDate)),
      activeCalls: D.portcalls.filter((c) => c.agentCode === co.code && ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'].includes(c.status)).length };
  }
  if ((m = url.match(/^\/vessels\/([a-f0-9]{24})\/voyages$/))) return vesselVoyages(m[1]);
  if ((m = url.match(/^\/vessels\/([a-f0-9]{24})\/movements$/))) return vesselMovements(m[1]);
  if ((m = url.match(/^\/cards\/([a-z]+)\/([A-Za-z0-9]+)$/))) return cardFor(m[1], m[2]);
  return undefined;
}

/* ---- v5: incidents dashboard, fleet dashboard, voyages/movements, quay twin, schedule, cards ---- */
const ACTIVE_CALL = ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'];

function incidentsDashboard() {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const all = (D.incidents || []).filter((i) => new Date(i.reportedAt) >= from);
  const everOpen = (D.incidents || []).filter((i) => ['OPEN', 'ACKNOWLEDGED', 'RESPONDING', 'MONITORING'].includes(i.status))
    .sort((a, b) => new Date(a.reportedAt) - new Date(b.reportedAt));
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const months = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= now) {
    months.push({ key: monthKey(cur), month: cur.toLocaleString('en-IN', { month: 'short', year: '2-digit' }), LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, total: 0 });
    cur.setMonth(cur.getMonth() + 1);
  }
  const byType = {}; const byCategory = {}; const byStatus = {};
  let resolvedN = 0; let resolveSum = 0; let ackN = 0; let ackSum = 0; let injuries = 0;
  for (const i of all) {
    const row = months.find((mm) => mm.key === monthKey(new Date(i.reportedAt)));
    if (row) { row[i.severity] += 1; row.total += 1; }
    byType[i.type] = (byType[i.type] || 0) + 1;
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
    byStatus[i.status] = (byStatus[i.status] || 0) + 1;
    injuries += i.injuries || 0;
    const end = i.resolvedAt || i.closedAt;
    if (end) { resolvedN += 1; resolveSum += (new Date(end) - new Date(i.reportedAt)) / HOUR; }
    if (i.acknowledgedAt) { ackN += 1; ackSum += (new Date(i.acknowledgedAt) - new Date(i.reportedAt)) / HOUR; }
  }
  const aging = { '0-24h': 0, '1-3d': 0, '3-7d': 0, '>7d': 0 };
  for (const i of everOpen) {
    const ageH = (now - new Date(i.reportedAt)) / HOUR;
    if (ageH <= 24) aging['0-24h'] += 1; else if (ageH <= 72) aging['1-3d'] += 1;
    else if (ageH <= 168) aging['3-7d'] += 1; else aging['>7d'] += 1;
  }
  return {
    kpis: {
      open: everOpen.length,
      highOpen: everOpen.filter((i) => ['HIGH', 'CRITICAL'].includes(i.severity)).length,
      loggedYtd: all.filter((i) => new Date(i.reportedAt) >= yearStart).length,
      closedYtd: all.filter((i) => i.closedAt && new Date(i.closedAt) >= yearStart).length,
      mttrHrs: resolvedN ? Math.round((resolveSum / resolvedN) * 10) / 10 : 0,
      mttaMin: ackN ? Math.round((ackSum / ackN) * 60) : 0,
      injuriesYtd: injuries,
    },
    byMonth: months.map(({ key, ...mm }) => mm),
    byType: Object.entries(byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    byCategory: Object.entries(byCategory).map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
    aging: Object.entries(aging).map(([bucket, count]) => ({ bucket, count })),
    openList: everOpen.slice(0, 12).map((i) => ({ _id: i._id, number: i.number, title: i.title, severity: i.severity, status: i.status, reportedAt: i.reportedAt, priority: i.priority, assignedTo: i.assignedTo })),
  };
}

function fleetDashboard() {
  const now = new Date();
  const activeSet = new Map(D.portcalls.filter((c) => ACTIVE_CALL.includes(c.status)).map((c) => [String(c.vessel), c.status]));
  const fleet = D.vessels.filter((v) => v.status === 'ACTIVE');
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
      if (st === 'VALID') certValid += 1; else if (st === 'EXPIRING') { certExpiring += 1; alerts += 1; } else { certExpired += 1; alerts += 1; }
    }
    if (alerts) certAlertVessels.push({ _id: v._id, name: v.name, type: v.type, alerts });
  }
  certAlertVessels.sort((a, b) => b.alerts - a.alerts);
  return {
    kpis: {
      fleet: fleet.length, inactive: D.vessels.length - fleet.length,
      inPort: [...activeSet.values()].filter((s2) => s2 === 'BERTHED').length,
      inbound: [...activeSet.values()].filter((s2) => ['ANNOUNCED', 'CONFIRMED'].includes(s2)).length,
      atAnchor: [...activeSet.values()].filter((s2) => s2 === 'AT_ANCHORAGE').length,
      avgAge: fleet.length ? Math.round(fleet.reduce((s2, v) => s2 + (now.getFullYear() - (v.built || now.getFullYear())), 0) / fleet.length) : 0,
      totalDwt: fleet.reduce((s2, v) => s2 + (v.dwt || 0), 0),
    },
    byType: Object.entries(byType).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
    byFlag: Object.entries(byFlag).map(([flag, count]) => ({ flag, count })).sort((a, b) => b.count - a.count),
    byClass: Object.entries(byClass).map(([cls, count]) => ({ cls, count })).sort((a, b) => b.count - a.count),
    ageBands: Object.entries(ageBands).map(([band, count]) => ({ band, count })),
    certs: { valid: certValid, expiring: certExpiring, expired: certExpired },
    certAlertVessels: certAlertVessels.slice(0, 8),
  };
}

function vesselVoyages(id) {
  const calls = D.portcalls.filter((c) => String(c.vessel) === id && c.status === 'SAILED')
    .sort((a, b) => new Date(b.atd) - new Date(a.atd)).slice(0, 40);
  const voyages = calls.map((c) => {
    const b = c.berth && maps.berths.get(String(c.berth));
    return {
      callId: c._id, vcn: c.vcn, fromPort: c.prevPort || '—', toPort: c.nextPort || '—',
      arrived: c.ata, sailed: c.atd, berth: b ? b.code : '—', terminal: b ? b.terminal : '—', purpose: c.purpose,
      cargo: (c.cargoOps || []).map((o) => `${o.operation === 'LOAD' ? 'Loaded' : 'Discharged'} ${new Intl.NumberFormat('en-IN').format(o.qty)} ${o.unit} ${o.cargoType}`).join('; '),
      portDays: c.ata && c.atd ? Math.round(((new Date(c.atd) - new Date(c.ata)) / 86400000) * 10) / 10 : null,
    };
  });
  const laneCount = {};
  for (const c of calls) for (const p of [c.prevPort, c.nextPort]) if (p) laneCount[p] = (laneCount[p] || 0) + 1;
  const lanes = Object.entries(laneCount).map(([port, calls2]) => ({ port, calls: calls2 })).sort((a, b) => b.calls - a.calls).slice(0, 8);
  return { voyages, lanes };
}

function vesselMovements(id) {
  const lp = (snap.tracking?.positions || []).find((p2) => String(p2.vessel?._id) === id);
  const position = lp ? { lat: lp.lat, lon: lp.lon, course: lp.course, speed: lp.speed, navStatus: lp.navStatus, receivedAt: lp.receivedAt } : null;
  const events = D.portcalls.filter((c) => String(c.vessel) === id)
    .sort((a, b) => new Date(b.eta) - new Date(a.eta)).slice(0, 12)
    .flatMap((c) => (c.statusHistory || []).map((h) => ({ at: h.at, vcn: c.vcn, event: h.to, note: h.note || '' })))
    .sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 40);
  return { position, events };
}

function opsTwin() {
  const active = D.portcalls.filter((c) => ACTIVE_CALL.includes(c.status));
  const byBerth = new Map(active.filter((c) => c.status === 'BERTHED' && c.berth).map((c) => [String(c.berth), c]));
  const vOf = (c) => maps.vessels.get(String(c.vessel));
  return {
    berths: D.berths.slice().sort((a, b) => (a.code < b.code ? -1 : 1)).map((b) => {
      const c = byBerth.get(String(b._id));
      const v = c && vOf(c);
      return {
        _id: b._id, code: b.code, name: b.name, terminal: b.terminal, berthType: b.berthType,
        loaMax: b.loaMax, draftMax: b.draftMax, status: b.status,
        occupiedBy: c ? {
          callId: c._id, vcn: c.vcn, vesselId: v?._id, vessel: v?.name, type: v?.type, loa: v?.loa, atb: c.atb, etd: c.etd,
          cargo: (c.cargoOps || []).map((o) => `${o.operation.toLowerCase()} ${new Intl.NumberFormat('en-IN').format(o.qty)} ${o.unit} ${o.cargoType}`).join('; '),
        } : null,
      };
    }),
    anchorage: active.filter((c) => c.status === 'AT_ANCHORAGE').map((c) => {
      const v = vOf(c);
      return { callId: c._id, vcn: c.vcn, vesselId: v?._id, vessel: v?.name, type: v?.type, loa: v?.loa, since: c.ata, etb: c.etb };
    }),
    inbound: active.filter((c) => ['ANNOUNCED', 'CONFIRMED'].includes(c.status)).map((c) => {
      const v = vOf(c);
      return { callId: c._id, vcn: c.vcn, vesselId: v?._id, vessel: v?.name, type: v?.type, loa: v?.loa, eta: c.eta, status: c.status };
    }).sort((a, b) => new Date(a.eta) - new Date(b.eta)),
  };
}

function opsSchedule(params = {}) {
  const days = Math.min(14, Math.max(1, parseInt(params.days, 10) || 5));
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const from = new Date(start.getTime() - DAY);
  const to = new Date(start.getTime() + days * DAY);
  const events = [];
  for (const c of D.portcalls) {
    if (c.status === 'CANCELLED') continue;
    const v = maps.vessels.get(String(c.vessel));
    const b = c.berth && maps.berths.get(String(c.berth));
    const base = { callId: c._id, vcn: c.vcn, vesselId: v?._id, vessel: v?.name, type: v?.type, berth: b ? b.code : '—', agent: c.agentName, status: c.status };
    const inWin = (d) => d && new Date(d) >= from && new Date(d) <= to;
    if (['ANNOUNCED', 'CONFIRMED'].includes(c.status) && inWin(c.eta)) events.push({ ...base, kind: 'ARRIVAL', at: c.eta, planned: true });
    if (c.status === 'AT_ANCHORAGE' && inWin(c.etb)) events.push({ ...base, kind: 'BERTHING', at: c.etb, planned: true });
    if (c.status === 'BERTHED' && c.etd) events.push({ ...base, kind: 'SAILING', at: c.etd, planned: true });
    if (c.status === 'SAILED' && inWin(c.atd)) events.push({ ...base, kind: 'SAILED', at: c.atd, planned: false });
  }
  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  return { from, to, events };
}

function cardFor(type, id) {
  const inr2 = (x) => x; // labels only
  if (type === 'user') {
    const u = maps ? (D.users.find((x) => String(x._id) === id)) : null;
    if (!u) throw new Error('Record not found');
    const role = maps.roles.get(String(u.role));
    return {
      kind: 'user', title: u.name, subtitle: u.designation || role?.name || '',
      lines: [
        { label: 'Role', value: role?.name || '—' }, { label: 'Email', value: u.email },
        { label: 'Phone', value: u.phone || '—' }, { label: 'Last sign-in', value: u.lastLoginAt || null, kind: 'since' },
      ],
      chips: [{ label: u.active === false ? 'Disabled' : 'Active', tone: u.active === false ? 'default' : 'success' }],
    };
  }
  if (type === 'vessel') {
    const v = maps.vessels.get(id);
    if (!v) throw new Error('Record not found');
    const call = D.portcalls.find((c) => String(c.vessel) === id && ACTIVE_CALL.includes(c.status));
    const b = call && call.berth && maps.berths.get(String(call.berth));
    const alerts = (v.certificates || []).filter((c) => certStatus(c.expiryDate) !== 'VALID').length;
    const situation = !call ? 'No active call'
      : call.status === 'BERTHED' ? `Berthed at ${b?.code || '—'} (${call.vcn})`
        : call.status === 'AT_ANCHORAGE' ? `At anchorage (${call.vcn})` : `Inbound — ${call.status.toLowerCase()} (${call.vcn})`;
    return {
      kind: 'vessel', title: v.name, subtitle: `IMO ${v.imo} · ${v.type} · ${v.flag} flag`, link: `/vessels/${v._id}`,
      lines: [
        { label: 'Now', value: situation }, { label: 'Owner', value: v.owner || '—' },
        { label: 'Agent', value: v.agent || '—' },
        { label: 'DWT / LOA', value: `${new Intl.NumberFormat('en-IN').format(v.dwt || 0)} MT · ${v.loa || '—'} m` },
      ],
      chips: [
        { label: v.status, tone: v.status === 'ACTIVE' ? 'success' : 'default' },
        ...(alerts ? [{ label: `${alerts} cert alert${alerts > 1 ? 's' : ''}`, tone: 'warning' }] : []),
      ],
    };
  }
  if (type === 'seafarer') {
    const s2 = maps.seafarers.get(id);
    if (!s2) throw new Error('Record not found');
    const cv = s2.currentVessel && maps.vessels.get(String(s2.currentVessel));
    const alerts = (s2.certificates || []).filter((c) => certStatus(c.expiryDate) !== 'VALID').length;
    return {
      kind: 'seafarer', title: s2.name, subtitle: `${s2.rank} · CDC ${s2.cdcNo}`, link: `/seafarers/${s2._id}`,
      lines: [
        { label: 'On board', value: cv?.name || 'Ashore' }, { label: 'Nationality', value: s2.nationality },
        { label: 'INDoS', value: s2.indosNo || '—' }, { label: 'Phone', value: s2.phone || '—' },
      ],
      chips: [
        { label: s2.status.replace(/_/g, ' '), tone: s2.status === 'ACTIVE' ? 'success' : 'default' },
        ...(alerts ? [{ label: `${alerts} cert alert${alerts > 1 ? 's' : ''}`, tone: 'warning' }] : []),
      ],
    };
  }
  if (type === 'berth') {
    const b = maps.berths.get(id);
    if (!b) throw new Error('Record not found');
    const call = D.portcalls.find((c) => String(c.berth) === id && c.status === 'BERTHED');
    const v = call && maps.vessels.get(String(call.vessel));
    return {
      kind: 'berth', title: `${b.code} — ${b.name}`, subtitle: b.terminal,
      lines: [
        { label: 'Type', value: b.berthType },
        { label: 'Max LOA / draft', value: `${b.loaMax || '—'} m · ${b.draftMax || '—'} m` },
        { label: 'Alongside', value: call ? `${v?.name} (${call.vcn})` : 'Free' },
      ],
      chips: [
        { label: b.status, tone: b.status === 'OPERATIONAL' ? 'success' : 'warning' },
        { label: call ? 'Occupied' : 'Free', tone: call ? 'info' : 'default' },
      ],
    };
  }
  if (type === 'agent') {
    const a = D.lookups.find((l) => l.category === 'agent' && l.code === String(id).toUpperCase());
    if (!a) throw new Error('Record not found');
    const activeCalls = D.portcalls.filter((c) => c.agentCode === a.code && ACTIVE_CALL.includes(c.status)).length;
    return {
      kind: 'agent', title: a.label, subtitle: `Shipping agent · ${a.code}`,
      lines: [
        { label: 'Address', value: inr2(a.meta?.address || '—') }, { label: 'GSTIN', value: a.meta?.gstin || '—' },
        { label: 'Active calls', value: String(activeCalls) },
      ],
      chips: [{ label: 'Licensed', tone: 'success' }],
    };
  }
  if (type === 'incident') {
    const i = maps.incidents.get(id);
    if (!i) throw new Error('Record not found');
    return {
      kind: 'incident', title: i.number, subtitle: i.title, link: `/incidents/${i._id}`,
      lines: [
        { label: 'Type', value: i.type.replace(/_/g, ' ') },
        { label: 'Case officer', value: i.assignedTo?.name || 'Unassigned' },
        { label: 'Reported', value: i.reportedAt, kind: 'since' },
      ],
      chips: [
        { label: i.severity, tone: ['HIGH', 'CRITICAL'].includes(i.severity) ? 'error' : i.severity === 'MEDIUM' ? 'warning' : 'default' },
        { label: i.status.replace(/_/g, ' '), tone: ['RESOLVED', 'CLOSED'].includes(i.status) ? 'success' : 'info' },
      ],
    };
  }
  throw new Error('Record not found');
}

/* ---- v6: report library, berthing report, settings, module settings, companies, audit dashboard ---- */
const nfIN = new Intl.NumberFormat('en-IN');
const rdt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
const rdOnly = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const rInr = (p) => `₹${nfIN.format(Math.round(p))}`;

function demoTideTable(from, days = 7) {
  const rows = [];
  const base = new Date(from); base.setHours(0, 0, 0, 0);
  for (let d2 = 0; d2 < days; d2++) {
    const day = new Date(base.getTime() + d2 * DAY);
    const doy = Math.floor((day - new Date(day.getFullYear(), 0, 0)) / DAY);
    const drift = (doy * 50) % (24 * 60);
    const spring = 0.7 + 0.3 * Math.cos((doy % 14.7) / 14.7 * 2 * Math.PI);
    const events = [];
    for (let k = 0; k < 4; k++) {
      const mins = (drift + k * 372) % (24 * 60);
      const high = k % 2 === 1;
      const height = high ? 4.0 + 1.4 * spring : 2.6 - 1.5 * spring;
      events.push({ mins, type: high ? 'H' : 'L', height: Math.max(0.4, height) });
    }
    events.sort((a, b) => a.mins - b.mins);
    rows.push({
      date: day.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      tides: events.map((e) => `${e.type} ${String(Math.floor(e.mins / 60)).padStart(2, '0')}${String(e.mins % 60).padStart(2, '0')} · ${e.height.toFixed(2)} m`).join('   '),
    });
  }
  return rows;
}

const DEMO_REPORT_CATALOG = [
  { key: 'berthing', module: 'ops', icon: 'Anchor', name: 'Daily Berthing Report', desc: 'Published marine format — tide table, vessels alongside (with vacant berths), sailed in 48 h, anchorage and expected line-up.' },
  { key: 'vessel-lineup', module: 'ops', icon: 'EventNote', name: 'Vessel Line-up', desc: 'Expected arrivals with ETA, agent, LOA and purpose for the coming days.' },
  { key: 'berth-occupancy', module: 'ops', icon: 'ViewTimeline', name: 'Berth Occupancy (30 days)', desc: 'Calls, occupied hours and utilisation percentage per berth.' },
  { key: 'anchorage-waiting', module: 'ops', icon: 'HourglassBottom', name: 'Anchorage Waiting Time', desc: 'Pre-berthing waiting hours by vessel type over the trailing 90 days.' },
  { key: 'marine-craft-log', module: 'ops', icon: 'DirectionsBoat', name: 'Marine Craft Status', desc: 'Tugs, launches and pilot roster with live status and current tasking.' },
  { key: 'fleet-register', module: 'ships', icon: 'DirectionsBoatFilled', name: 'Vessel Register Extract', desc: 'The registered fleet with particulars, ownership, class and agent.' },
  { key: 'cert-expiry', module: 'ships', icon: 'WorkspacePremium', name: 'Certificate Expiry (Fleet)', desc: 'Ship certificates expiring or expired, ordered by urgency.' },
  { key: 'crew-cert-expiry', module: 'crew', icon: 'Badge', name: 'Crew Certificate Expiry', desc: 'Every expiring or expired seafarer document, ordered by urgency.' },
  { key: 'crew-medical', module: 'crew', icon: 'MonitorHeart', name: 'Medical Fitness Register', desc: 'ILO/MLC medical fitness status for the whole roll, with days to expiry.' },
  { key: 'crew-coc-register', module: 'crew', icon: 'WorkspacePremium', name: 'CoC / Licence Register', desc: 'Certificates of competency with grade, issuer and validity.' },
  { key: 'crew-roster', module: 'crew', icon: 'Groups', name: 'Crew Roster Extract', desc: 'The full seafarer register — identity, rank, status and current vessel.' },
  { key: 'crew-onboard', module: 'crew', icon: 'DirectionsBoat', name: 'Crew On Board (by vessel)', desc: 'Who is signed on which vessel right now, with document alerts.' },
  { key: 'crew-sea-service', module: 'crew', icon: 'EventNote', name: 'Sea Service Summary', desc: 'Verified sea time per seafarer — totals, last vessel and verification rate.' },
  { key: 'notice-ack', module: 'legis', icon: 'Gavel', name: 'Notice Acknowledgment Status', desc: 'Circulars and notices requiring acknowledgment, with acknowledgment counts.' },
  { key: 'incident-register', module: 'incidents', icon: 'CrisisAlert', name: 'Incident Register Extract', desc: 'Case list for a period with severity, status, officer and resolution.' },
  { key: 'hse-monthly', module: 'incidents', icon: 'MonitorHeart', name: 'HSE Monthly Summary', desc: 'Cases by category and severity with MTTA/MTTR against module targets.' },
  { key: 'deficiency-analysis', module: 'inspect', icon: 'FactCheck', name: 'Deficiency Analysis', desc: 'Top deficiency codes from closed surveys with action-code mix.' },
  { key: 'detention-register', module: 'inspect', icon: 'Block', name: 'Detention Register', desc: 'Every detention with vessel, grounds and release details.' },
  { key: 'checklist-compliance', module: 'inspect', icon: 'Checklist', name: 'Checklist Compliance', desc: 'Per-template answer compliance across closed surveys.' },
  { key: 'licence-register', module: 'facil', icon: 'CorporateFare', name: 'Licence Register', desc: 'Port company licences with status, validity and rating.' },
  { key: 'outstanding-ageing', module: 'finance', icon: 'ReceiptLong', name: 'Outstanding Invoices — Ageing', desc: 'Issued invoices bucketed 0–30 / 31–60 / 61–90 / 90+ days.' },
  { key: 'collections', module: 'finance', icon: 'Payments', name: 'Collections Report', desc: 'Payments received in the period with references.' },
  { key: 'revenue-by-head', module: 'finance', icon: 'PriceChange', name: 'Revenue by Tariff Head', desc: 'Billed amounts per tariff line for the trailing 12 months.' },
  { key: 'user-access', module: 'admin', icon: 'AdminPanelSettings', name: 'User Access Report', desc: 'Users by role and department with last sign-in.' },
];

const DEMO_MODULE_DEFAULTS = {
  ops: { vcnPrefix: 'MUN', anchorageAlertHrs: 24, defaultTugsUnder250m: 2, defaultTugsOver250m: 3, scheduleWindowDays: 5, channelSpeedLimitKn: 8, aisGapAlertMin: 30, anchorDriftNm: 0.2, zoneEntryWatch: true },
  ships: { certExpiringDays: 30, dryDockReminderDays: 60, riskRefreshMinutes: 30 },
  crew: { medicalExpiringDays: 45, minRestHours: 10, cocVerifyOnSignOn: true },
  legis: { ackRequiredDefault: false, ackReminderDays: 7, showSupersededDays: 365 },
  incidents: { mttaTargetMin: 30, mttrTargetHrs: 24, autoNotifySeverity: 'HIGH', reopenWindowDays: 30, injuryReportHrs: 24 },
  inspect: { findingDueDays: 14, detentionThreshold: 1, passScorePct: 80, requireEvidencePhotos: false },
  facil: { licenceValidityYears: 2, auditIntervalMonths: 12, renewalReminderDays: 90 },
  finance: { invoicePrefix: 'MUN/INV', paymentTermsDays: 30, overdueReminderDays: 7, roundTotalsToRupee: true },
  mis: { defaultPeriodMonths: 12, exportFooter: 'Generated by Mundra Port Operations Portal' },
  masters: { allowHardDelete: false },
  admin: { sessionTimeoutMin: 60, passwordMinLength: 8, auditRetentionDays: 730 },
};

const DEMO_SETTINGS = {
  _sections: { org: 'Organisation profile', operations: 'Operations', billing: 'Billing & tax', notifications: 'Notifications', smtp: 'SMTP (outbound mail)', ai: 'AI assistant' },
  operations: { workingHours: '24×365', pilotBoardingGround: '3 NM SE of breakwaters', vhfWorkingChannel: 'Ch 12', marsecLevel: 1, monsoonMode: false },
  billing: { gstRate: 18, placeOfSupply: 'Gujarat (24)', sacCode: '996751', roundToRupee: true, creditNoteApproval: true },
  notifications: { certExpiryDigest: true, incidentPush: true, invoiceOverdueDigest: true, digestHourIst: 8 },
  smtp: { host: 'smtp.mundraport.example.in', port: 587, secure: true, username: 'portal-mailer', password: '••••1234', fromName: 'Mundra Port Operations', fromEmail: 'noreply@mundraport.in', enabled: true },
  ai: { enabled: true, provider: 'anthropic', model: 'claude-opus-5', apiKey: '••••demo', temperature: 0.2, groundedOnly: true, dailyTokenBudget: 500000 },
};

function demoRunReport(key) {
  const sect = (heading, columns, rows) => ({ heading, columns, rows });
  const col = (k, label, align) => ({ key: k, label, align });
  const out = { key, title: (DEMO_REPORT_CATALOG.find((c) => c.key === key) || {}).name || key, generatedAt: new Date().toISOString() };
  const active = D.portcalls.filter((c) => ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'].includes(c.status));
  const vOf = (c) => maps.vessels.get(String(c.vessel));
  const bOf = (c) => (c.berth ? maps.berths.get(String(c.berth)) : null);

  if (key === 'berthing') {
    const atBerth = new Map(active.filter((c) => c.status === 'BERTHED' && c.berth).map((c) => [bOf(c)?.code, c]));
    const sailed48 = D.portcalls.filter((c) => c.status === 'SAILED' && c.atd && Date.now() - new Date(c.atd) <= 2 * DAY)
      .sort((a, b) => new Date(b.atd) - new Date(a.atd));
    out.subtitle = 'Daily marine report — tide, alongside, sailed and expected traffic';
    out.sections = [
      sect('Tidal predictions — Mundra (next 7 days)', [col('date', 'Date'), col('tides', 'Low / High water (IST · height)')], demoTideTable(new Date())),
      sect('Vessels at berth', [col('berth', 'Berth'), col('terminal', 'Terminal'), col('vcn', 'VCN'), col('vessel', 'Vessel name'), col('loa', 'LOA (m)', 'right'), col('agent', 'Agent'), col('cargo', 'Cargo / service'), col('draft', 'Draft FWD/AFT'), col('atb', 'Actual berthing'), col('etd', 'ETS')],
        D.berths.slice().sort((a, b) => (a.code < b.code ? -1 : 1)).map((b) => {
          const c = atBerth.get(b.code);
          if (!c) return { berth: b.code, terminal: b.terminal, vcn: '—', vessel: b.status === 'MAINTENANCE' ? 'UNDER MAINTENANCE' : 'VACANT', loa: '', agent: '', cargo: '', draft: '', atb: '', etd: '' };
          const v = vOf(c);
          return { berth: b.code, terminal: b.terminal, vcn: c.vcn, vessel: v?.name, loa: v?.loa || '', agent: c.agentCode || '',
            cargo: (c.cargoOps || []).map((o) => `${o.operation === 'LOAD' ? 'L' : 'D'} ${nfIN.format(o.qty)} ${o.unit} ${o.cargoType}`).join('; '),
            draft: c.draftArrival ? `${(c.draftArrival - 0.2).toFixed(1)} / ${c.draftArrival}` : '—', atb: rdt(c.atb), etd: rdt(c.etd) };
        })),
      sect('Vessels sailed (last 48 hours)', [col('berth', 'Berth'), col('vcn', 'VCN'), col('vessel', 'Vessel name'), col('loa', 'LOA (m)', 'right'), col('agent', 'Agent'), col('sd', 'Sailing draft (m)'), col('atb', 'Actual berthing'), col('atd', 'Actual sailing')],
        sailed48.map((c) => ({ berth: bOf(c)?.code || '—', vcn: c.vcn, vessel: vOf(c)?.name, loa: vOf(c)?.loa || '', agent: c.agentCode || '', sd: c.draftDeparture || '—', atb: rdt(c.atb), atd: rdt(c.atd) }))),
      sect('Vessels at anchorage', [col('vcn', 'VCN'), col('vessel', 'Vessel name'), col('loa', 'LOA (m)', 'right'), col('agent', 'Agent'), col('since', 'At anchor since'), col('etb', 'ETB')],
        active.filter((c) => c.status === 'AT_ANCHORAGE').map((c) => ({ vcn: c.vcn, vessel: vOf(c)?.name, loa: vOf(c)?.loa || '', agent: c.agentCode || '', since: rdt(c.ata), etb: rdt(c.etb) }))),
      sect('Expected vessels — line-up', [col('sr', 'Sr', 'right'), col('vcn', 'VCN'), col('vessel', 'Vessel name'), col('eta', 'ETA / ETB'), col('agent', 'Agent'), col('loa', 'LOA (m)', 'right'), col('purpose', 'Purpose'), col('status', 'Status')],
        active.filter((c) => ['ANNOUNCED', 'CONFIRMED'].includes(c.status)).sort((a, b) => new Date(a.eta) - new Date(b.eta))
          .map((c, i) => ({ sr: i + 1, vcn: c.vcn, vessel: vOf(c)?.name, eta: rdt(c.eta), agent: c.agentCode || '', loa: vOf(c)?.loa || '', purpose: c.purpose || '—', status: c.status }))),
    ];
    return out;
  }
  if (key === 'vessel-lineup') {
    const rows = active.filter((c) => ['ANNOUNCED', 'CONFIRMED'].includes(c.status)).sort((a, b) => new Date(a.eta) - new Date(b.eta));
    out.subtitle = `${rows.length} vessels expected`;
    out.sections = [sect('Expected vessels', [col('sr', 'Sr', 'right'), col('vcn', 'VCN'), col('vessel', 'Vessel'), col('type', 'Type'), col('loa', 'LOA (m)', 'right'), col('eta', 'ETA'), col('agent', 'Agent'), col('purpose', 'Purpose'), col('prevPort', 'From')],
      rows.map((c, i) => ({ sr: i + 1, vcn: c.vcn, vessel: vOf(c)?.name, type: vOf(c)?.type, loa: vOf(c)?.loa, eta: rdt(c.eta), agent: c.agentCode, purpose: c.purpose, prevPort: c.prevPort || '—' })))];
    return out;
  }
  if (key === 'berth-occupancy') {
    const since = Date.now() - 30 * DAY;
    out.subtitle = 'Trailing 30 days';
    out.sections = [sect('Berth utilisation', [col('berth', 'Berth'), col('terminal', 'Terminal'), col('type', 'Type'), col('calls', 'Calls', 'right'), col('hours', 'Occupied hrs', 'right'), col('util', 'Utilisation', 'right'), col('status', 'Status')],
      D.berths.map((b) => {
        const mine = D.portcalls.filter((c) => String(c.berth) === String(b._id) && c.atb && new Date(c.atb) >= since);
        const hours = mine.reduce((s, c) => s + Math.max(0, ((c.atd ? new Date(c.atd) : new Date()) - new Date(c.atb)) / HOUR), 0);
        return { berth: b.code, terminal: b.terminal, type: b.berthType, calls: mine.length, hours: Math.round(hours), util: `${Math.min(100, Math.round((hours / (30 * 24)) * 100))}%`, status: b.status };
      }))];
    return out;
  }
  if (key === 'anchorage-waiting') {
    const since = Date.now() - 90 * DAY;
    const byType = {};
    for (const c of D.portcalls.filter((x) => x.status === 'SAILED' && x.atd && new Date(x.atd) >= since && x.ata && x.atb)) {
      const t = vOf(c)?.type || 'OTHER';
      byType[t] = byType[t] || { type: t, calls: 0, total: 0, max: 0 };
      const w = (new Date(c.atb) - new Date(c.ata)) / HOUR;
      byType[t].calls += 1; byType[t].total += w; byType[t].max = Math.max(byType[t].max, w);
    }
    out.subtitle = 'Trailing 90 days — hours between arrival and berthing';
    out.sections = [sect('Waiting time by vessel type', [col('type', 'Vessel type'), col('calls', 'Calls', 'right'), col('avg', 'Avg wait (h)', 'right'), col('max', 'Max wait (h)', 'right')],
      Object.values(byType).map((r) => ({ type: r.type, calls: r.calls, avg: (r.total / r.calls).toFixed(1), max: r.max.toFixed(1) })).sort((a, b) => b.calls - a.calls))];
    return out;
  }
  if (key === 'marine-craft-log') {
    const rows = (D.resources || []);
    out.subtitle = `${rows.length} craft & pilots on strength`;
    out.sections = [sect('Marine resources', [col('code', 'Code'), col('name', 'Name'), col('type', 'Type'), col('spec', 'Specification'), col('status', 'Status'), col('task', 'Current tasking'), col('master', 'Master / holder'), col('contact', 'Contact')],
      rows.map((r) => ({ code: r.code, name: r.name, type: r.type.replace(/_/g, ' '), spec: r.spec, status: r.status, task: r.currentTask || '—', master: r.master || '—', contact: r.contact })))];
    return out;
  }
  if (key === 'fleet-register') {
    const rows = D.vessels.filter((v) => v.status === 'ACTIVE');
    out.subtitle = `${rows.length} active vessels`;
    out.sections = [sect('Vessel register', [col('name', 'Vessel'), col('imo', 'IMO'), col('type', 'Type'), col('flag', 'Flag'), col('built', 'Built', 'right'), col('dwt', 'DWT', 'right'), col('loa', 'LOA', 'right'), col('owner', 'Owner / operator'), col('cls', 'Class'), col('agent', 'Agent')],
      rows.map((v) => ({ name: v.name, imo: v.imo, type: v.type, flag: v.flag, built: v.built, dwt: nfIN.format(v.dwt || 0), loa: v.loa, owner: v.operator || v.owner, cls: v.classSociety, agent: v.agent })))];
    return out;
  }
  if (key === 'cert-expiry' || key === 'crew-cert-expiry') {
    const src = key === 'cert-expiry' ? D.vessels.filter((v) => v.status === 'ACTIVE') : (D.seafarers || []);
    const rows = src.flatMap((v) => (v.certificates || []).map((c) => ({ who: v.name, id2: key === 'cert-expiry' ? v.imo : v.cdcNo, extra: key === 'cert-expiry' ? '' : v.rank, cert: c.certType, number: c.number, issuer: c.issuer, expiry: c.expiryDate, st: certStatus(c.expiryDate) })))
      .filter((c) => c.st !== 'VALID').sort((a, b) => new Date(a.expiry) - new Date(b.expiry));
    out.subtitle = `${rows.length} documents flagged`;
    out.sections = [sect(key === 'cert-expiry' ? 'Expiring / expired ship certificates' : 'Expiring / expired crew documents',
      [col('who', key === 'cert-expiry' ? 'Vessel' : 'Seafarer'), col('id2', key === 'cert-expiry' ? 'IMO' : 'CDC'), ...(key === 'cert-expiry' ? [] : [col('extra', 'Rank')]), col('cert', 'Document'), col('expiry', 'Expiry'), col('st', 'Status')],
      rows.map((c) => ({ ...c, expiry: rdOnly(c.expiry) })))];
    return out;
  }
  if (key === 'notice-ack') {
    const ins = (D.instruments || []).filter((i) => i.ackRequired);
    const userCount = D.users.filter((u) => u.active !== false).length;
    out.subtitle = `${ins.length} instruments require acknowledgment · ${userCount} active users`;
    out.sections = [sect('Acknowledgment status', [col('ref', 'Reference'), col('title', 'Title'), col('issued', 'Issued'), col('status', 'Status'), col('acks', 'Acknowledged by', 'right'), col('pct', '% of users', 'right')],
      ins.map((i) => ({ ref: i.refNo, title: i.title, issued: rdOnly(i.issuedDate), status: i.status, acks: (i.acknowledgedBy || []).length, pct: userCount ? `${Math.round(((i.acknowledgedBy || []).length / userCount) * 100)}%` : '—' })))];
    return out;
  }
  if (key === 'incident-register') {
    const from = Date.now() - 90 * DAY;
    const rows = (D.incidents || []).filter((i) => new Date(i.reportedAt) >= from).sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt));
    out.subtitle = `${rows.length} cases in the trailing 90 days`;
    out.sections = [sect('Incident register', [col('number', 'Case'), col('title', 'Title'), col('cat', 'Category'), col('sev', 'Severity'), col('status', 'Status'), col('officer', 'Case officer'), col('reported', 'Reported'), col('resolved', 'Resolved')],
      rows.map((i) => ({ number: i.number, title: i.title, cat: i.category, sev: i.severity, status: i.status, officer: i.assignedTo?.name || '—', reported: rdt(i.reportedAt), resolved: i.resolvedAt ? rdt(i.resolvedAt) : '—' })))];
    return out;
  }
  if (key === 'hse-monthly') {
    const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
    const prev = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const rows = (D.incidents || []).filter((i) => new Date(i.reportedAt) >= prev);
    const bucket = (list) => {
      const o = {};
      for (const i of list) {
        o[i.category] = o[i.category] || { category: i.category, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, total: 0, injuries: 0 };
        o[i.category][i.severity] += 1; o[i.category].total += 1; o[i.category].injuries += i.injuries || 0;
      }
      return Object.values(o).sort((a, b) => b.total - a.total);
    };
    const cols = [col('category', 'Category'), col('LOW', 'Low', 'right'), col('MEDIUM', 'Medium', 'right'), col('HIGH', 'High', 'right'), col('CRITICAL', 'Critical', 'right'), col('total', 'Total', 'right'), col('injuries', 'Injuries', 'right')];
    const sla = DEMO_MODULE_DEFAULTS.incidents;
    out.subtitle = `Targets — MTTA ${sla.mttaTargetMin} min · MTTR ${sla.mttrTargetHrs} h`;
    out.sections = [
      sect(`This month (${from.toLocaleString('en-IN', { month: 'long' })})`, cols, bucket(rows.filter((i) => new Date(i.reportedAt) >= from))),
      sect(`Previous month (${prev.toLocaleString('en-IN', { month: 'long' })})`, cols, bucket(rows.filter((i) => new Date(i.reportedAt) < from))),
    ];
    return out;
  }
  if (key === 'deficiency-analysis') {
    const label = Object.fromEntries(D.lookups.filter((l) => l.category === 'deficiencyCode').map((c) => [c.code, c.label]));
    const agg = {};
    for (const i of D.inspections.filter((x) => x.status === 'CLOSED')) for (const f of i.findings || []) {
      agg[f.deficiencyCode] = agg[f.deficiencyCode] || { code: f.deficiencyCode, count: 0, open: 0, det: 0 };
      agg[f.deficiencyCode].count += 1;
      if (f.status === 'OPEN') agg[f.deficiencyCode].open += 1;
      if (f.actionCode === '30') agg[f.deficiencyCode].det += 1;
    }
    out.subtitle = 'All closed surveys';
    out.sections = [sect('Deficiency codes by frequency', [col('code', 'Code'), col('label', 'Deficiency'), col('count', 'Occurrences', 'right'), col('open', 'Still open', 'right'), col('det', 'Detainable', 'right')],
      Object.values(agg).sort((a, b) => b.count - a.count).map((r) => ({ ...r, label: label[r.code] || '—' })))];
    return out;
  }
  if (key === 'detention-register') {
    const rows = D.inspections.filter((i) => i.detention);
    out.subtitle = `${rows.length} detentions on record`;
    out.sections = [sect('Detention register', [col('number', 'Survey'), col('vessel', 'Vessel'), col('imo', 'IMO'), col('type', 'Type'), col('grounds', 'Detainable grounds'), col('date', 'Closed')],
      rows.map((i) => { const v = maps.vessels.get(String(i.vessel)); return { number: i.number, vessel: v?.name, imo: v?.imo, type: i.type, grounds: (i.findings || []).filter((f) => f.actionCode === '30').map((f) => f.deficiencyCode).join(', ') || '—', date: rdOnly(i.closedAt) }; }))];
    return out;
  }
  if (key === 'checklist-compliance') {
    const agg = {};
    for (const i of D.inspections.filter((x) => x.status === 'CLOSED')) {
      const total = (i.checklist || []).length;
      if (!total) continue;
      const yes = (i.checklist || []).filter((c) => c.answer === 'YES').length;
      agg[i.type] = agg[i.type] || { type: i.type, surveys: 0, items: 0, yes: 0 };
      agg[i.type].surveys += 1; agg[i.type].items += total; agg[i.type].yes += yes;
    }
    out.subtitle = 'Answer compliance across closed surveys';
    out.sections = [sect('Checklist compliance by survey type', [col('type', 'Survey type'), col('surveys', 'Surveys', 'right'), col('items', 'Items answered', 'right'), col('pct', 'Compliance', 'right')],
      Object.values(agg).map((r) => ({ type: r.type, surveys: r.surveys, items: r.items, pct: `${Math.round((r.yes / r.items) * 100)}%` })))];
    return out;
  }
  if (key === 'licence-register') {
    const rows = D.licenses || [];
    out.subtitle = `${rows.length} licences`;
    out.sections = [sect('Licence register', [col('no', 'Licence no.'), col('entity', 'Company'), col('type', 'Type'), col('status', 'Status'), col('issued', 'Issued'), col('expiry', 'Valid till'), col('rating', 'Rating', 'right')],
      rows.map((l) => ({ no: l.licenseNo, entity: l.entityName, type: l.entityType.replace(/_/g, ' '), status: l.status, issued: rdOnly(l.issueDate), expiry: rdOnly(l.expiryDate), rating: l.performanceRating || '—' })))];
    return out;
  }
  if (key === 'outstanding-ageing') {
    const rows = D.invoices.filter((i) => i.status === 'ISSUED');
    const bucketOf = (d2) => (d2 <= 30 ? '0-30' : d2 <= 60 ? '31-60' : d2 <= 90 ? '61-90' : '90+');
    const totals = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const detail = rows.map((i) => {
      const age = Math.floor((Date.now() - new Date(i.issuedAt)) / DAY);
      totals[bucketOf(age)] += i.total;
      return { number: i.number, vessel: maps.vessels.get(String(i.vessel))?.name, billTo: i.billTo?.name, issued: rdOnly(i.issuedAt), age, bucket: bucketOf(age), amount: rInr(i.total) };
    });
    out.subtitle = `${rows.length} unpaid invoices · ${rInr(Object.values(totals).reduce((a, b2) => a + b2, 0))} outstanding`;
    out.sections = [
      sect('Ageing summary', [col('bucket', 'Bucket (days)'), col('amount', 'Outstanding', 'right')], Object.entries(totals).map(([bucket, amt]) => ({ bucket, amount: rInr(amt) }))),
      sect('Invoice detail', [col('number', 'Invoice'), col('vessel', 'Vessel'), col('billTo', 'Billed to'), col('issued', 'Issued'), col('age', 'Age (days)', 'right'), col('bucket', 'Bucket'), col('amount', 'Amount', 'right')], detail),
    ];
    return out;
  }
  if (key === 'collections') {
    const from = Date.now() - 30 * DAY;
    const rows = D.invoices.filter((i) => i.paidAt && new Date(i.paidAt) >= from).sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
    out.subtitle = `${rows.length} receipts in 30 days · ${rInr(rows.reduce((s, i) => s + i.total, 0))} collected`;
    out.sections = [sect('Collections', [col('paid', 'Received on'), col('number', 'Invoice'), col('vessel', 'Vessel'), col('billTo', 'Paid by'), col('ref', 'Payment ref'), col('amount', 'Amount', 'right')],
      rows.map((i) => ({ paid: rdOnly(i.paidAt), number: i.number, vessel: maps.vessels.get(String(i.vessel))?.name, billTo: i.billTo?.name, ref: i.paymentRef || '—', amount: rInr(i.total) })))];
    return out;
  }
  if (key === 'revenue-by-head') {
    const from = new Date(); from.setMonth(from.getMonth() - 11); from.setDate(1);
    const agg = {};
    for (const i of D.invoices.filter((x) => x.issuedAt && new Date(x.issuedAt) >= from && ['ISSUED', 'PAID'].includes(x.status))) {
      for (const l of i.lines || []) {
        agg[l.code] = agg[l.code] || { code: l.code, head: l.description.split(' — ')[0], qty: 0, amount: 0 };
        agg[l.code].qty += l.qty; agg[l.code].amount += l.amount;
      }
    }
    out.subtitle = 'Trailing 12 months — billed (issued + paid)';
    out.sections = [sect('Revenue by tariff head', [col('code', 'Code'), col('head', 'Tariff head'), col('qty', 'Billed qty', 'right'), col('amount', 'Amount', 'right')],
      Object.values(agg).sort((a, b) => b.amount - a.amount).map((r) => ({ ...r, qty: nfIN.format(Math.round(r.qty)), amount: rInr(r.amount) })))];
    return out;
  }
  if (key === 'user-access') {
    out.subtitle = `${D.users.length} accounts`;
    out.sections = [sect('User access', [col('name', 'Name'), col('designation', 'Designation'), col('department', 'Department'), col('role', 'Role'), col('email', 'Email'), col('status', 'Status'), col('last', 'Last sign-in')],
      D.users.slice().sort((a, b) => (a.name < b.name ? -1 : 1)).map((u) => ({ name: u.name, designation: u.designation, department: u.department || '—', role: maps.roles.get(String(u.role))?.name, email: u.email, status: u.active === false ? 'Disabled' : 'Active', last: u.lastLoginAt ? rdt(u.lastLoginAt) : 'Never' })))];
    return out;
  }

  if (key === 'crew-medical') {
    const win = DEMO_MODULE_DEFAULTS.crew.medicalExpiringDays;
    const rows = (D.seafarers || []).map((s2) => {
      const med = (s2.certificates || []).find((c) => /medical/i.test(c.certType));
      const days = med ? Math.floor((new Date(med.expiryDate) - Date.now()) / DAY) : null;
      return { name: s2.name, rank: s2.rank, cdc: s2.cdcNo, status: s2.status.replace(/_/g, ' '),
        expiry: med ? rdOnly(med.expiryDate) : 'NO MEDICAL ON FILE', days: days ?? '—',
        st: !med ? 'MISSING' : days < 0 ? 'EXPIRED' : days <= win ? 'EXPIRING' : 'VALID' };
    }).sort((a, b) => (a.days === '—' ? -1 : b.days === '—' ? 1 : a.days - b.days));
    out.subtitle = `Warning window ${win} days (crew module settings)`;
    out.sections = [sect('Medical fitness — whole roll',
      [col('name', 'Seafarer'), col('rank', 'Rank'), col('cdc', 'CDC'), col('status', 'Status'), col('expiry', 'Medical expiry'), col('days', 'Days left', 'right'), col('st', 'Fitness')], rows)];
    return out;
  }
  if (key === 'crew-coc-register') {
    const rows = (D.seafarers || []).flatMap((s2) => (s2.certificates || []).filter((c) => /competency/i.test(c.certType))
      .map((c) => ({ name: s2.name, rank: s2.rank, grade: c.grade || '—', number: c.number, issuer: c.issuer, cdc: s2.cdcNo, indos: s2.indosNo, expiry: rdOnly(c.expiryDate), st: certStatus(c.expiryDate) })));
    out.subtitle = `${rows.length} certificates of competency on file`;
    out.sections = [sect('CoC / licence register',
      [col('name', 'Seafarer'), col('rank', 'Rank'), col('grade', 'Grade'), col('number', 'CoC number'), col('issuer', 'Issuer'), col('cdc', 'CDC'), col('indos', 'INDoS'), col('expiry', 'Valid till'), col('st', 'Status')], rows)];
    return out;
  }
  if (key === 'crew-roster') {
    const rows = (D.seafarers || []).slice().sort((a, b) => (a.name < b.name ? -1 : 1));
    out.subtitle = `${rows.length} seafarers on the roll`;
    out.sections = [sect('Crew roster',
      [col('name', 'Name'), col('rank', 'Rank'), col('cdc', 'CDC'), col('indos', 'INDoS'), col('nat', 'Nationality'), col('status', 'Status'), col('vessel', 'Current vessel'), col('phone', 'Phone'), col('alerts', 'Doc alerts', 'right')],
      rows.map((s2) => ({ name: s2.name, rank: s2.rank, cdc: s2.cdcNo, indos: s2.indosNo, nat: s2.nationality, status: s2.status.replace(/_/g, ' '),
        vessel: s2.currentVessel ? (maps.vessels.get(String(s2.currentVessel))?.name || '—') : 'Ashore', phone: s2.phone || '—',
        alerts: (s2.certificates || []).filter((c) => certStatus(c.expiryDate) !== 'VALID').length || '—' })))];
    return out;
  }
  if (key === 'crew-onboard') {
    const onb = (D.seafarers || []).filter((s2) => s2.currentVessel);
    const byVessel = {};
    for (const s2 of onb) {
      const k2 = maps.vessels.get(String(s2.currentVessel))?.name || '—';
      byVessel[k2] = byVessel[k2] || []; byVessel[k2].push(s2);
    }
    out.subtitle = `${onb.length} crew signed on across ${Object.keys(byVessel).length} vessels`;
    out.sections = Object.entries(byVessel).map(([vesselName, list]) => sect(`${vesselName} — ${list.length} on board`,
      [col('name', 'Name'), col('rank', 'Rank'), col('cdc', 'CDC'), col('nat', 'Nationality'), col('alerts', 'Doc alerts', 'right')],
      list.map((s2) => ({ name: s2.name, rank: s2.rank, cdc: s2.cdcNo, nat: s2.nationality, alerts: (s2.certificates || []).filter((c) => certStatus(c.expiryDate) !== 'VALID').length || '—' }))));
    return out;
  }
  if (key === 'crew-sea-service') {
    const rows = (D.seafarers || []).map((s2) => {
      const svc = s2.seaService || [];
      const days = svc.reduce((t, x) => t + Math.max(0, Math.round((new Date(x.to) - new Date(x.from)) / DAY)), 0);
      const verified = svc.filter((x) => x.verified).length;
      const last = svc.slice().sort((a, b) => new Date(b.to) - new Date(a.to))[0];
      return { name: s2.name, rank: s2.rank, stints: svc.length, days: nfIN.format(days),
        lastVessel: last ? last.vesselName : '—', lastTo: last ? rdOnly(last.to) : '—',
        verified: svc.length ? `${Math.round((verified / svc.length) * 100)}%` : '—' };
    });
    out.subtitle = 'Aggregated from verified sea-service records';
    out.sections = [sect('Sea service summary',
      [col('name', 'Seafarer'), col('rank', 'Rank'), col('stints', 'Stints', 'right'), col('days', 'Total days', 'right'), col('lastVessel', 'Last vessel'), col('lastTo', 'Signed off'), col('verified', 'Verified', 'right')], rows)];
    return out;
  }
  throw new Error(`Not in the demo snapshot: report ${key}`);
}

function demoAuditDashboard() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const all = D.inspections;
  const closed = all.filter((i) => i.status === 'CLOSED');
  // Mirrors the live API: workload mix windows on plannedAt, result KPIs window
  // on closedAt — the same field the trend chart bins on, so cards reconcile
  const recent = all.filter((i) => i.plannedAt && new Date(i.plannedAt) >= from);
  const recentClosed = closed.filter((i) => i.closedAt && new Date(i.closedAt) >= from);
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const months = [];
  const cur = new Date(from);
  while (cur <= now) {
    months.push({ key: monthKey(cur), month: cur.toLocaleString('en-IN', { month: 'short', year: '2-digit' }), SATISFACTORY: 0, DEFICIENCIES: 0, DETAINED: 0 });
    cur.setMonth(cur.getMonth() + 1);
  }
  const byType = {};
  let findingsTotal = 0; let findingsOpen = 0; let checklistYes = 0; let checklistItems = 0;
  for (const i of recent) {
    byType[i.type] = byType[i.type] || { type: i.type, total: 0, closed: 0, detained: 0 };
    byType[i.type].total += 1;
    if (i.status === 'CLOSED') byType[i.type].closed += 1;
    if (i.detention) byType[i.type].detained += 1;
    checklistItems += (i.checklist || []).filter((c) => c.answer).length;
    checklistYes += (i.checklist || []).filter((c) => c.answer === 'YES').length;
  }
  // avg findings per closed inspection: numerator and denominator from the same set
  for (const i of recentClosed) findingsTotal += (i.findings || []).length;
  // open findings is a live worklist, not a period metric — counted lifetime
  for (const i of all) findingsOpen += (i.findings || []).filter((f) => f.status === 'OPEN').length;
  for (const i of closed) {
    if (!i.closedAt || !i.result) continue;
    const row = months.find((m) => m.key === monthKey(new Date(i.closedAt)));
    if (row) row[i.result] += 1;
  }
  return {
    kpis: {
      open: all.filter((i) => i.status !== 'CLOSED').length,
      closedYtd: closed.filter((i) => i.closedAt && new Date(i.closedAt) >= new Date(now.getFullYear(), 0, 1)).length,
      satisfactionPct: recentClosed.length ? Math.round((recentClosed.filter((i) => i.result === 'SATISFACTORY').length / recentClosed.length) * 100) : 0,
      detentionRatePct: recentClosed.length ? Math.round((recentClosed.filter((i) => i.detention).length / recentClosed.length) * 1000) / 10 : 0,
      avgFindings: recentClosed.length ? Math.round((findingsTotal / recentClosed.length) * 10) / 10 : 0,
      openFindings: findingsOpen,
      checklistCompliancePct: checklistItems ? Math.round((checklistYes / checklistItems) * 100) : 0,
    },
    byMonth: months.map(({ key, ...m }) => m),
    byType: Object.values(byType),
  };
}


function demoCrewDashboard() {
  const win = DEMO_MODULE_DEFAULTS.crew.medicalExpiringDays;
  const crew = D.seafarers || [];
  const byRank = {}; const funnel = { expired: 0, d30: 0, d90: 0, valid: 0 };
  let onboard = 0; let medicalIssues = 0; let seaDays = 0;
  const alertList = [];
  for (const s2 of crew) {
    byRank[s2.rank] = (byRank[s2.rank] || 0) + 1;
    if (s2.currentVessel) onboard += 1;
    seaDays += (s2.seaService || []).reduce((t, x) => t + Math.max(0, Math.round((new Date(x.to) - new Date(x.from)) / DAY)), 0);
    let alerts = 0;
    for (const c of s2.certificates || []) {
      const days = Math.floor((new Date(c.expiryDate) - Date.now()) / DAY);
      if (days < 0) { funnel.expired += 1; alerts += 1; }
      else if (days <= 30) { funnel.d30 += 1; alerts += 1; }
      else if (days <= 90) funnel.d90 += 1;
      else funnel.valid += 1;
      if (/medical/i.test(c.certType) && certStatus(c.expiryDate) !== 'VALID') medicalIssues += 1;
    }
    if (alerts) alertList.push({ _id: s2._id, name: s2.name, rank: s2.rank, vessel: s2.currentVessel ? (maps.vessels.get(String(s2.currentVessel))?.name || '—') : 'Ashore', alerts });
  }
  alertList.sort((a, b) => b.alerts - a.alerts);
  return {
    kpis: { roll: crew.length, onboard, ashore: crew.length - onboard, medicalIssues,
      avgSeaDays: crew.length ? Math.round(seaDays / crew.length) : 0, medicalWindow: win },
    byRank: Object.entries(byRank).map(([rank, count]) => ({ rank, count })).sort((a, b) => b.count - a.count),
    funnel, alertList: alertList.slice(0, 10),
  };
}

/* ---- v8: global search, berth planner, survey planner, risk matrix, SOF, PDA, public verify ---- */
const demoPdas = new Map(); // callId -> pda object, mirrors ackedInstruments-style ephemeral write

function demoSearch(q) {
  if (!q || q.trim().length < 2) return { groups: [] };
  const rx = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const LIMIT = 5;
  const groups = [];
  const push = (type, label, items) => { if (items.length) groups.push({ type, label, items: items.slice(0, LIMIT) }); };
  push('vessel', 'Vessels', D.vessels.filter((v) => rx.test(v.name) || rx.test(v.imo) || rx.test(v.callSign || ''))
    .map((v) => ({ id: v._id, label: v.name, sub: `IMO ${v.imo} · ${v.type}`, to: `/vessels/${v._id}` })));
  push('call', 'Port calls', D.portcalls.filter((c) => rx.test(c.vcn)).sort((a, b) => new Date(b.eta) - new Date(a.eta))
    .map((c) => ({ id: c._id, label: c.vcn, sub: `${maps.vessels.get(String(c.vessel))?.name || ''} · ${c.status}`, to: `/port-calls/${c._id}` })));
  push('seafarer', 'Seafarers', (D.seafarers || []).filter((s2) => rx.test(s2.name) || rx.test(s2.cdcNo) || rx.test(s2.indosNo || ''))
    .map((s2) => ({ id: s2._id, label: s2.name, sub: `${s2.rank} · CDC ${s2.cdcNo}`, to: `/seafarers/${s2._id}` })));
  push('company', 'Companies', (D.companies || []).filter((c) => rx.test(c.name) || rx.test(c.code))
    .map((c) => ({ id: c._id, label: c.name, sub: `${c.code} · ${String(c.category || '').replace(/_/g, ' ')}`, to: `/companies/${c._id}` })));
  push('incident', 'Incidents', (D.incidents || []).filter((i) => rx.test(i.number) || rx.test(i.title)).sort((a, b) => new Date(b.reportedAt) - new Date(a.reportedAt))
    .map((i) => ({ id: i._id, label: `${i.number} — ${i.title}`, sub: `${i.severity} · ${i.status}`, to: `/incidents/${i._id}` })));
  push('invoice', 'Invoices', D.invoices.filter((i) => rx.test(i.number)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((i) => ({ id: i._id, label: i.number, sub: `₹${nfIN.format(Math.round(i.total || 0))} · ${i.status}`, to: `/invoices/${i._id}` })));
  push('notice', 'Notices & circulars', (D.instruments || []).filter((n) => rx.test(n.refNo) || rx.test(n.title)).sort((a, b) => new Date(b.issuedDate) - new Date(a.issuedDate))
    .map((n) => ({ id: n._id, label: `${n.refNo} — ${n.title}`, sub: n.status, to: '/legislation' })));
  push('licence', 'Licences', (D.licenses || []).filter((l) => rx.test(l.licenseNo) || rx.test(l.entityName))
    .map((l) => ({ id: l._id, label: l.licenseNo, sub: `${l.entityName} · ${l.status}`, to: '/licenses' })));
  push('user', 'Users', D.users.filter((u) => rx.test(u.name) || rx.test(u.email))
    .map((u) => ({ id: u._id, label: u.name, sub: `${u.designation || ''} · ${u.email}`, to: '/admin/users' })));
  return { groups, q };
}

function demoRiskMatrix(days) {
  const win = days || 180;
  const since = Date.now() - win * DAY;
  const cases = (D.incidents || []).filter((i) => new Date(i.reportedAt) >= since);
  const L = { P1: 5, P2: 4, P3: 3, P4: 2 };
  const C = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2 };
  const key = (l, c) => `${l}:${c}`;
  const initial = {}; const residual = {};
  for (const i of cases) {
    const l = L[i.priority] || 3; const c = C[i.severity] || 3;
    const k = key(l, c);
    (initial[k] = initial[k] || []).push(i);
    const done = ['RESOLVED', 'CLOSED'].includes(i.status);
    const rk = key(done ? Math.max(1, l - 1) : l, done ? Math.max(1, c - 1) : c);
    (residual[rk] = residual[rk] || []).push(i);
  }
  const pack = (m) => Object.entries(m).map(([k2, list]) => {
    const [l, c] = k2.split(':').map(Number);
    return { likelihood: l, consequence: c, count: list.length, sample: list.slice(0, 6).map((i) => ({ _id: i._id, number: i.number, title: i.title, status: i.status })) };
  });
  return { days: win, total: cases.length, initial: pack(initial), residual: pack(residual) };
}

function demoBerthPlan(params) {
  const winDays = Number(params.days) || 5;
  const from = params.from ? new Date(params.from) : new Date(Date.now() - DAY);
  const to = new Date(from.getTime() + (winDays + 1) * DAY);
  const berths = D.berths.slice().sort((a, b) => (a.terminal < b.terminal ? -1 : a.terminal > b.terminal ? 1 : (a.code < b.code ? -1 : 1)));
  const calls = D.portcalls.filter((c) => c.berth && ['CONFIRMED', 'AT_ANCHORAGE', 'BERTHED', 'SAILED'].includes(c.status)
    && (c.atb ? new Date(c.atb) < to && (!c.atd || new Date(c.atd) > from) : (c.etb && new Date(c.etb) < to && c.etd && new Date(c.etd) > from)));
  const blocks = calls.map((c) => ({
    id: c._id, vcn: c.vcn, berth: String(c.berth), status: c.status,
    vessel: (() => { const v = maps.vessels.get(String(c.vessel)); return v ? { name: v.name, loa: v.loa, type: v.type } : null; })(),
    start: c.atb || c.etb, end: c.atd || c.etd || null, actual: !!c.atb,
  }));
  const byBerth = {};
  for (const b of blocks) (byBerth[b.berth] = byBerth[b.berth] || []).push(b);
  const conflicts = [];
  for (const list of Object.values(byBerth)) {
    list.sort((a, b) => new Date(a.start) - new Date(b.start));
    for (let i = 1; i < list.length; i += 1) {
      const prevEnd = list[i - 1].end ? new Date(list[i - 1].end) : new Date(8640000000000000);
      if (new Date(list[i].start) < prevEnd) conflicts.push({ a: list[i - 1].vcn, b: list[i].vcn, berth: list[i].berth });
    }
  }
  const inbound = D.portcalls.filter((c) => ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE'].includes(c.status) && (!c.berth || !c.etb) && new Date(c.eta) < to)
    .sort((a, b) => new Date(a.eta) - new Date(b.eta)).slice(0, 20);
  return {
    window: { from, to, days: winDays },
    berths: berths.map((b) => ({ _id: b._id, code: b.code, name: b.name, terminal: b.terminal, berthType: b.berthType, status: b.status, loaMax: b.loaMax, draftMax: b.draftMax })),
    blocks, conflicts,
    unallocated: inbound.map((c) => ({ id: c._id, vcn: c.vcn, eta: c.eta, status: c.status, vessel: (() => { const v = maps.vessels.get(String(c.vessel)); return v ? { name: v.name, loa: v.loa, type: v.type } : null; })() })),
  };
}

function demoSurveyPlanner() {
  const MONTH = 30.44 * DAY;
  const now = Date.now();
  const horizon = now + 24 * MONTH;
  const vessels = D.vessels.filter((v) => v.status === 'ACTIVE');
  const lanes = vessels.map((v) => {
    let anchor = v.lastDryDock ? new Date(v.lastDryDock).getTime() : new Date(v.built || 2018, 5, 15).getTime();
    while (anchor + 60 * MONTH < now) anchor += 60 * MONTH;
    const events = [];
    const push = (type, dueMs, windowMonths) => {
      if (dueMs < now - 6 * MONTH || dueMs > horizon) return;
      const from = dueMs - windowMonths * MONTH; const to = dueMs + windowMonths * MONTH;
      events.push({ type, due: new Date(dueMs), window: { from: new Date(from), to: new Date(to) }, status: now > to ? 'OVERDUE' : now >= from ? 'WINDOW_OPEN' : 'PLANNED' });
    };
    for (let y = 1; y <= 6; y += 1) push('ANNUAL', anchor + y * 12 * MONTH, 3);
    push('INTERMEDIATE', anchor + 30 * MONTH, 3);
    push('SPECIAL', anchor + 60 * MONTH, 3);
    push('DRY_DOCK', anchor + 60 * MONTH, 2);
    events.sort((a, b) => new Date(a.due) - new Date(b.due));
    return { vessel: { _id: v._id, name: v.name, imo: v.imo, type: v.type, classSociety: v.classSociety, lastDryDock: v.lastDryDock }, events };
  });
  return { horizonMonths: 24, from: new Date(now - 6 * MONTH), to: new Date(horizon), lanes };
}

function demoSof(callId) {
  const call = maps.portcalls.get(callId);
  if (!call) throw new Error('Port call not found');
  const v = maps.vessels.get(String(call.vessel));
  const b = call.berth ? maps.berths.get(String(call.berth)) : null;
  const ev = [];
  const push = (at, event, detail) => { if (at) ev.push({ at, event, detail: detail || '' }); };
  push(call.createdAt, 'Vessel call announced', `VCN ${call.vcn} issued to ${call.agentName || call.agentCode || 'agent'}`);
  for (const h of call.statusHistory || []) push(h.at, `Status: ${String(h.from || '').replace(/_/g, ' ')} → ${String(h.to || '').replace(/_/g, ' ')}`, h.note);
  push(call.ata, 'Arrived pilot station / anchorage', call.draftArrival ? `Arrival draft ${call.draftArrival} m` : '');
  push(call.atb, `All fast alongside ${b ? b.code : ''}`, b ? b.terminal : '');
  for (const c of call.cargoOps || []) {
    const what = `${c.operation === 'LOAD' ? 'Loading' : 'Discharge'} ${c.cargoType} — ${nfIN.format(c.qty)} ${c.unit}`;
    push(c.startedAt, `${what} commenced`, c.gangs ? `${c.gangs} gangs` : '');
    push(c.completedAt, `${what} completed`, c.remarks);
  }
  for (const s2 of call.services || []) push(s2.at, `Service rendered: ${String(s2.type).replace(/_/g, ' ')}`, s2.description || s2.remarks);
  push(call.atd, 'Vessel sailed', call.draftDeparture ? `Sailing draft ${call.draftDeparture} m · for ${call.nextPort || 'sea'}` : (call.nextPort ? `For ${call.nextPort}` : ''));
  ev.sort((a, b2) => new Date(a.at) - new Date(b2.at));
  return {
    call: { vcn: call.vcn, agentName: call.agentName, agentCode: call.agentCode, vessel: v ? { name: v.name, imo: v.imo, flag: v.flag } : null, berth: b ? { code: b.code } : null },
    events: ev,
  };
}

const TARIFF_BY_CODE = Object.fromEntries((D.tariffs || []).map((t) => [t.code, t]));
function demoGeneratePda(callId) {
  const call = maps.portcalls.get(callId);
  if (!call) throw new Error('Port call not found');
  const v = maps.vessels.get(String(call.vessel));
  if (!v || !v.grt) throw new Error('The vessel needs a GRT before an estimate can be made');
  const ops = DEMO_MODULE_DEFAULTS.ops;
  const grt = v.grt; const loa = v.loa || 0;
  const tugs = loa >= 250 ? ops.defaultTugsOver250m : ops.defaultTugsUnder250m;
  const plannedDays = call.etb && call.etd ? Math.max(1, Math.ceil((new Date(call.etd) - new Date(call.etb)) / DAY)) : 2;
  const lines = [];
  const have = new Set();
  const add = (code, qty, suffix) => {
    const t = TARIFF_BY_CODE[code];
    if (!t || !qty || have.has(code)) return;
    have.add(code);
    lines.push({ code: t.code, description: suffix ? `${t.name} — ${suffix}` : t.name, unit: t.unit, qty, rate: t.rate, amount: Math.round(qty * t.rate * 100) / 100 });
  };
  if (v.grt) add('PD', v.grt, '');
  for (const s2 of call.services || []) add(s2.tariffCode, s2.qty || 1, s2.description);
  for (const c of call.cargoOps || []) {
    const wc = c.unit === 'TEU' ? 'WFC' : c.unit === 'UNITS' ? 'WFR' : /CRUDE|POL|EDIBLE|LNG|LPG|CHEMICAL/i.test(c.cargoType) ? 'WFL' : 'WFB';
    add(wc, c.qty, c.cargoType);
  }
  add('PIL', 2, 'inward + outward');
  add('TUG', tugs * 2, `${tugs} tugs × 2 movements`);
  add('BH', grt * plannedDays, `${plannedDays} days alongside (planned)`);
  if (!lines.length) throw new Error('No tariff heads matched — check the tariff master');
  const gstRate = DEMO_SETTINGS.billing.gstRate;
  const subtotal = Math.round(lines.reduce((s2, l) => s2 + l.amount, 0) * 100) / 100;
  const gstAmount = Math.round(subtotal * gstRate) / 100;
  const total = Math.round((subtotal + gstAmount) * 100) / 100;
  const pda = { number: `PDA/${call.vcn}`, lines, subtotal, gstRate, gstAmount, total,
    basis: { grt, plannedDays, tugs }, generatedAt: new Date().toISOString(), generatedBy: currentUser.name };
  demoPdas.set(callId, pda);
  return pda;
}
function demoPdaView(callId) {
  const call = maps.portcalls.get(callId);
  if (!call) throw new Error('Port call not found');
  const pda = demoPdas.get(callId);
  if (!pda) return { call: null, pda: null, variance: null };
  const v = maps.vessels.get(String(call.vessel));
  const invoice = D.invoices.find((i) => String(i.portCall) === callId && ['ISSUED', 'PAID'].includes(i.status));
  let variance = null;
  if (invoice) {
    const codes = new Set([...pda.lines.map((l) => l.code), ...invoice.lines.map((l) => l.code)]);
    variance = {
      lines: [...codes].map((code) => {
        const est = pda.lines.filter((l) => l.code === code).reduce((s2, l) => s2 + l.amount, 0);
        const act = invoice.lines.filter((l) => l.code === code).reduce((s2, l) => s2 + l.amount, 0);
        return { code, estimated: Math.round(est * 100) / 100, actual: Math.round(act * 100) / 100, delta: Math.round((act - est) * 100) / 100 };
      }),
      estimatedTotal: pda.total, actualTotal: invoice.total, delta: Math.round((invoice.total - pda.total) * 100) / 100,
      invoiceNumber: invoice.number,
    };
  }
  return { call: { vcn: call.vcn, vessel: v ? { name: v.name, imo: v.imo, grt: v.grt } : null, agentName: call.agentName, eta: call.eta }, pda, variance };
}

function demoPublicVerify(licenseNo) {
  const doc = (D.licenses || []).find((l) => l.licenseNo === licenseNo);
  if (!doc) return { found: false, licenseNo };
  const expired = doc.expiryDate && new Date(doc.expiryDate) < new Date();
  return {
    found: true, licenseNo: doc.licenseNo, entityName: doc.entityName, entityType: doc.entityType, status: doc.status,
    issueDate: doc.issueDate, expiryDate: doc.expiryDate, valid: doc.status === 'ISSUED' && !expired,
    reason: doc.status !== 'ISSUED' ? `Licence is ${doc.status.toLowerCase()}` : expired ? 'Licence has expired' : 'Licence is in force',
  };
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
    if (url === '/settings') return { success: true, data: { org: clone(snap.org), ...clone(DEMO_SETTINGS) } };
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
    if (url === '/incidents/dashboard') return { success: true, data: incidentsDashboard() };
    if (url === '/vessels/fleet-dashboard') return { success: true, data: fleetDashboard() };
    if (url === '/ops/twin') return { success: true, data: opsTwin() };
    if (url === '/ops/schedule') return { success: true, data: opsSchedule(params) };
    if (url === '/ops/resources') return { success: true, data: clone(D.resources || []) };
    if (url === '/reports/catalog') return { success: true, data: clone(DEMO_REPORT_CATALOG) };
    if (url.startsWith('/reports/run/')) return { success: true, data: demoRunReport(url.slice('/reports/run/'.length)) };
    if (url.startsWith('/module-settings/')) {
      const mk = url.slice('/module-settings/'.length);
      const dft = DEMO_MODULE_DEFAULTS[mk];
      if (!dft) throw new Error(`No settings for module ${mk}`);
      return { success: true, data: clone(dft), meta: { defaults: clone(dft) } };
    }
    if (url === '/inspections/dashboard') return { success: true, data: demoAuditDashboard() };
    if (url === '/seafarers/dashboard') return { success: true, data: demoCrewDashboard() };
    if (url === '/search') return { success: true, data: demoSearch(params.q) };
    if (url === '/incidents/risk-matrix') return { success: true, data: demoRiskMatrix(Number(params.days)) };
    if (url === '/ops/berth-plan') return { success: true, data: demoBerthPlan(params) };
    if (url === '/vessels/survey-planner') return { success: true, data: demoSurveyPlanner() };
    { const mm = url.match(/^\/port-calls\/([a-f0-9]{24})\/sof$/); if (mm) return { success: true, data: demoSof(mm[1]) }; }
    { const mm = url.match(/^\/port-calls\/([a-f0-9]{24})\/pda$/); if (mm) return { success: true, data: demoPdaView(mm[1]) }; }
    { const mm = url.match(/^\/public\/verify\/(.+)$/); if (mm) return { success: true, data: demoPublicVerify(decodeURIComponent(mm[1])) }; }
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
    if ((m = url.match(/^\/port-calls\/([a-f0-9]{24})\/pda$/))) return { success: true, data: demoGeneratePda(m[1]) };
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
    if (url === '/settings/smtp/test') {
      const s3 = { ...DEMO_SETTINGS.smtp, ...body };
      if (!s3.host) throw new Error('SMTP host is required');
      return { success: true, data: { status: 'SIMULATED_OK',
        detail: `Would connect to ${s3.host}:${s3.port} (${s3.secure ? 'TLS' : 'plain'}) as ${s3.username} and send from "${s3.fromName}" <${s3.fromEmail}>. Outbound relay is disabled in the demo.`,
        checkedAt: new Date().toISOString() } };
    }
    if (url === '/notifications/read-all') { D.notifications.forEach((n) => readBy.add(String(n._id))); return { success: true, data: { read: true } }; }
    throw new Error(READ_ONLY);
  },
  async put() { throw new Error(READ_ONLY); },
  async delete() { throw new Error(READ_ONLY); },
};

export default demo;
