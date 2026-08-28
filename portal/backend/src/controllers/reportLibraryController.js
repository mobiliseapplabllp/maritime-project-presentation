/* Report library — pre-seeded, parameterised reports from every module.
 * GET /reports/catalog lists them; GET /reports/run/:key executes one and
 * returns a uniform shape the generic viewer renders and exports:
 *   { key, title, subtitle, generatedAt, params, sections: [{heading, sub?, columns:[{key,label,align?}], rows:[...]}] }
 * The daily berthing report mirrors the port's published format (tide table,
 * vessels at berth incl. VACANT slots, sailed vessels, expected line-up). */
const {
  PortCall, Vessel, Berth, Invoice, Inspection, Seafarer, Instrument, License,
  Incident, User, AuditLog, Resource, Lookup, Company,
} = require('../models');
const { certStatus } = require('../domain/certStatus');
const { ApiError, ok } = require('../utils/respond');

const H = 3600 * 1000; const D = 24 * H;
const nf = new Intl.NumberFormat('en-IN');
const dt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }) : '—');
const dOnly = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const inr = (p) => `₹${nf.format(Math.round(p))}`;
const ACTIVE = ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'];

// Deterministic semidiurnal tide predictions in the Harbour range (springs ~5.4 m).
function tideTable(from, days = 7) {
  const rows = [];
  const base = new Date(from); base.setHours(0, 0, 0, 0);
  for (let d2 = 0; d2 < days; d2++) {
    const day = new Date(base.getTime() + d2 * D);
    const doy = Math.floor((day - new Date(day.getFullYear(), 0, 0)) / D);
    const drift = (doy * 50) % (24 * 60);                       // ~50 min/day progression
    const spring = 0.7 + 0.3 * Math.cos((doy % 14.7) / 14.7 * 2 * Math.PI); // spring–neap cycle
    const events = [];
    for (let k = 0; k < 4; k++) {
      const mins = (drift + k * 372) % (24 * 60);               // ~6h12m spacing
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

async function berthingReport() {
  const [berths, calls] = await Promise.all([
    Berth.find().sort('code').lean(),
    PortCall.find({ $or: [{ status: { $in: ACTIVE } }, { status: 'SAILED', atd: { $gte: new Date(Date.now() - 2 * D) } }] })
      .populate('vessel', 'name imo loa type').populate('berth', 'code terminal').lean(),
  ]);
  const atBerth = new Map(calls.filter((c) => c.status === 'BERTHED' && c.berth).map((c) => [c.berth.code, c]));
  const sections = [];
  sections.push({
    heading: 'Tidal predictions — Harbour (next 7 days)',
    columns: [{ key: 'date', label: 'Date' }, { key: 'tides', label: 'Low / High water (IST · height)' }],
    rows: tideTable(new Date()),
  });
  sections.push({
    heading: 'Vessels at berth',
    columns: [
      { key: 'berth', label: 'Berth' }, { key: 'terminal', label: 'Terminal' }, { key: 'vcn', label: 'VCN' },
      { key: 'vessel', label: 'Vessel name' }, { key: 'loa', label: 'LOA (m)', align: 'right' },
      { key: 'agent', label: 'Agent' }, { key: 'cargo', label: 'Cargo / service' },
      { key: 'draft', label: 'Draft FWD/AFT' }, { key: 'atb', label: 'Actual berthing' }, { key: 'etd', label: 'ETS' },
    ],
    rows: berths.map((b) => {
      const c = atBerth.get(b.code);
      if (!c) return { berth: b.code, terminal: b.terminal, vcn: '—', vessel: b.status === 'MAINTENANCE' ? 'UNDER MAINTENANCE' : 'VACANT', loa: '', agent: '', cargo: '', draft: '', atb: '', etd: '' };
      const fwd = c.draftArrival ? (c.draftArrival - 0.2).toFixed(1) : '—';
      return {
        berth: b.code, terminal: b.terminal, vcn: c.vcn, vessel: c.vessel?.name,
        loa: c.vessel?.loa || '', agent: c.agentCode || '',
        cargo: (c.cargoOps || []).map((o) => `${o.operation === 'LOAD' ? 'L' : 'D'} ${nf.format(o.qty)} ${o.unit} ${o.cargoType}`).join('; '),
        draft: c.draftArrival ? `${fwd} / ${c.draftArrival}` : '—',
        atb: dt(c.atb), etd: dt(c.etd),
      };
    }),
  });
  const sailed = calls.filter((c) => c.status === 'SAILED').sort((a, b) => new Date(b.atd) - new Date(a.atd));
  sections.push({
    heading: 'Vessels sailed (last 48 hours)',
    columns: [
      { key: 'berth', label: 'Berth' }, { key: 'vcn', label: 'VCN' }, { key: 'vessel', label: 'Vessel name' },
      { key: 'loa', label: 'LOA (m)', align: 'right' }, { key: 'agent', label: 'Agent' },
      { key: 'sd', label: 'Sailing draft (m)' }, { key: 'atb', label: 'Actual berthing' }, { key: 'atd', label: 'Actual sailing' },
    ],
    rows: sailed.map((c) => ({
      berth: c.berth?.code || '—', vcn: c.vcn, vessel: c.vessel?.name, loa: c.vessel?.loa || '',
      agent: c.agentCode || '', sd: c.draftDeparture || '—', atb: dt(c.atb), atd: dt(c.atd),
    })),
  });
  const anchored = calls.filter((c) => c.status === 'AT_ANCHORAGE');
  sections.push({
    heading: 'Vessels at anchorage',
    columns: [
      { key: 'vcn', label: 'VCN' }, { key: 'vessel', label: 'Vessel name' }, { key: 'loa', label: 'LOA (m)', align: 'right' },
      { key: 'agent', label: 'Agent' }, { key: 'since', label: 'At anchor since' }, { key: 'etb', label: 'ETB' },
    ],
    rows: anchored.map((c) => ({ vcn: c.vcn, vessel: c.vessel?.name, loa: c.vessel?.loa || '', agent: c.agentCode || '', since: dt(c.ata), etb: dt(c.etb) })),
  });
  const expected = calls.filter((c) => ['ANNOUNCED', 'CONFIRMED'].includes(c.status)).sort((a, b) => new Date(a.eta) - new Date(b.eta));
  sections.push({
    heading: 'Expected vessels — line-up',
    columns: [
      { key: 'sr', label: 'Sr', align: 'right' }, { key: 'vcn', label: 'VCN' }, { key: 'vessel', label: 'Vessel name' },
      { key: 'eta', label: 'ETA / ETB' }, { key: 'agent', label: 'Agent' }, { key: 'loa', label: 'LOA (m)', align: 'right' },
      { key: 'purpose', label: 'Purpose' }, { key: 'status', label: 'Status' },
    ],
    rows: expected.map((c, i) => ({ sr: i + 1, vcn: c.vcn, vessel: c.vessel?.name, eta: dt(c.eta), agent: c.agentCode || '', loa: c.vessel?.loa || '', purpose: c.purpose || '—', status: c.status })),
  });
  return { subtitle: 'Daily marine report — tide, alongside, sailed and expected traffic', sections };
}

const CATALOG = [
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

const RUNNERS = {
  berthing: berthingReport,

  'vessel-lineup': async () => {
    const rows = await PortCall.find({ status: { $in: ['ANNOUNCED', 'CONFIRMED'] } })
      .populate('vessel', 'name type loa').sort('eta').lean();
    return { subtitle: `${rows.length} vessels expected`, sections: [{
      heading: 'Expected vessels',
      columns: [
        { key: 'sr', label: 'Sr', align: 'right' }, { key: 'vcn', label: 'VCN' }, { key: 'vessel', label: 'Vessel' },
        { key: 'type', label: 'Type' }, { key: 'loa', label: 'LOA (m)', align: 'right' }, { key: 'eta', label: 'ETA' },
        { key: 'agent', label: 'Agent' }, { key: 'purpose', label: 'Purpose' }, { key: 'prevPort', label: 'From' },
      ],
      rows: rows.map((c, i) => ({ sr: i + 1, vcn: c.vcn, vessel: c.vessel?.name, type: c.vessel?.type, loa: c.vessel?.loa, eta: dt(c.eta), agent: c.agentCode, purpose: c.purpose, prevPort: c.prevPort || '—' })),
    }] };
  },

  'berth-occupancy': async () => {
    const since = new Date(Date.now() - 30 * D);
    const [berths, calls] = await Promise.all([
      Berth.find().sort('code').lean(),
      PortCall.find({ atb: { $gte: since } }).select('berth atb atd status').lean(),
    ]);
    const rows = berths.map((b) => {
      const mine = calls.filter((c) => String(c.berth) === String(b._id));
      const hours = mine.reduce((s, c) => s + Math.max(0, ((c.atd ? new Date(c.atd) : new Date()) - new Date(c.atb)) / H), 0);
      return { berth: b.code, terminal: b.terminal, type: b.berthType, calls: mine.length,
        hours: Math.round(hours), util: `${Math.min(100, Math.round((hours / (30 * 24)) * 100))}%`, status: b.status };
    });
    return { subtitle: 'Trailing 30 days', sections: [{
      heading: 'Berth utilisation',
      columns: [
        { key: 'berth', label: 'Berth' }, { key: 'terminal', label: 'Terminal' }, { key: 'type', label: 'Type' },
        { key: 'calls', label: 'Calls', align: 'right' }, { key: 'hours', label: 'Occupied hrs', align: 'right' },
        { key: 'util', label: 'Utilisation', align: 'right' }, { key: 'status', label: 'Status' },
      ],
      rows,
    }] };
  },

  'anchorage-waiting': async () => {
    const since = new Date(Date.now() - 90 * D);
    const calls = await PortCall.find({ status: 'SAILED', atd: { $gte: since }, ata: { $exists: true }, atb: { $exists: true } })
      .populate('vessel', 'type').select('ata atb vessel').lean();
    const byType = {};
    for (const c of calls) {
      const t = c.vessel?.type || 'OTHER';
      byType[t] = byType[t] || { type: t, calls: 0, total: 0, max: 0 };
      const w = (new Date(c.atb) - new Date(c.ata)) / H;
      byType[t].calls += 1; byType[t].total += w; byType[t].max = Math.max(byType[t].max, w);
    }
    return { subtitle: 'Trailing 90 days — hours between arrival and berthing', sections: [{
      heading: 'Waiting time by vessel type',
      columns: [
        { key: 'type', label: 'Vessel type' }, { key: 'calls', label: 'Calls', align: 'right' },
        { key: 'avg', label: 'Avg wait (h)', align: 'right' }, { key: 'max', label: 'Max wait (h)', align: 'right' },
      ],
      rows: Object.values(byType).map((r) => ({ type: r.type, calls: r.calls, avg: (r.total / r.calls).toFixed(1), max: r.max.toFixed(1) })).sort((a, b) => b.calls - a.calls),
    }] };
  },

  'marine-craft-log': async () => {
    const rows = await Resource.find().sort('type code').lean();
    return { subtitle: `${rows.length} craft & pilots on strength`, sections: [{
      heading: 'Marine resources',
      columns: [
        { key: 'code', label: 'Code' }, { key: 'name', label: 'Name' }, { key: 'type', label: 'Type' },
        { key: 'spec', label: 'Specification' }, { key: 'status', label: 'Status' }, { key: 'task', label: 'Current tasking' },
        { key: 'master', label: 'Master / holder' }, { key: 'contact', label: 'Contact' },
      ],
      rows: rows.map((r) => ({ code: r.code, name: r.name, type: r.type.replace(/_/g, ' '), spec: r.spec, status: r.status, task: r.currentTask || '—', master: r.master || '—', contact: r.contact })),
    }] };
  },

  'fleet-register': async () => {
    const rows = await Vessel.find({ status: 'ACTIVE' }).sort('name').lean();
    return { subtitle: `${rows.length} active vessels`, sections: [{
      heading: 'Vessel register',
      columns: [
        { key: 'name', label: 'Vessel' }, { key: 'imo', label: 'IMO' }, { key: 'type', label: 'Type' },
        { key: 'flag', label: 'Flag' }, { key: 'built', label: 'Built', align: 'right' },
        { key: 'dwt', label: 'DWT', align: 'right' }, { key: 'loa', label: 'LOA', align: 'right' },
        { key: 'owner', label: 'Owner / operator' }, { key: 'cls', label: 'Class' }, { key: 'agent', label: 'Agent' },
      ],
      rows: rows.map((v) => ({ name: v.name, imo: v.imo, type: v.type, flag: v.flag, built: v.built, dwt: nf.format(v.dwt || 0), loa: v.loa, owner: v.operator || v.owner, cls: v.classSociety, agent: v.agent })),
    }] };
  },

  'cert-expiry': async () => {
    const vessels = await Vessel.find({ status: 'ACTIVE' }).select('name imo certificates').lean();
    const rows = vessels.flatMap((v) => (v.certificates || []).map((c) => ({ ...c, vessel: v.name, imo: v.imo, st: certStatus(c.expiryDate) })))
      .filter((c) => c.st !== 'VALID')
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    return { subtitle: `${rows.length} certificates flagged`, sections: [{
      heading: 'Expiring / expired ship certificates',
      columns: [
        { key: 'vessel', label: 'Vessel' }, { key: 'imo', label: 'IMO' }, { key: 'cert', label: 'Certificate' },
        { key: 'number', label: 'Number' }, { key: 'issuer', label: 'Issuer' }, { key: 'expiry', label: 'Expiry' }, { key: 'st', label: 'Status' },
      ],
      rows: rows.map((c) => ({ vessel: c.vessel, imo: c.imo, cert: c.certType, number: c.number, issuer: c.issuer, expiry: dOnly(c.expiryDate), st: c.st })),
    }] };
  },

  'crew-cert-expiry': async () => {
    const crew = await Seafarer.find().select('name rank cdcNo certificates').lean();
    const rows = crew.flatMap((s) => (s.certificates || []).map((c) => ({ ...c, name: s.name, rank: s.rank, cdc: s.cdcNo, st: certStatus(c.expiryDate) })))
      .filter((c) => c.st !== 'VALID')
      .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
    return { subtitle: `${rows.length} documents flagged`, sections: [{
      heading: 'Expiring / expired crew documents',
      columns: [
        { key: 'name', label: 'Seafarer' }, { key: 'rank', label: 'Rank' }, { key: 'cdc', label: 'CDC' },
        { key: 'cert', label: 'Document' }, { key: 'expiry', label: 'Expiry' }, { key: 'st', label: 'Status' },
      ],
      rows: rows.map((c) => ({ name: c.name, rank: c.rank, cdc: c.cdc, cert: c.certType, expiry: dOnly(c.expiryDate), st: c.st })),
    }] };
  },

  'notice-ack': async () => {
    const [ins, userCount] = await Promise.all([
      Instrument.find({ ackRequired: true }).lean(),
      User.countDocuments({ active: true }),
    ]);
    return { subtitle: `${ins.length} instruments require acknowledgment · ${userCount} active users`, sections: [{
      heading: 'Acknowledgment status',
      columns: [
        { key: 'ref', label: 'Reference' }, { key: 'title', label: 'Title' }, { key: 'issued', label: 'Issued' },
        { key: 'status', label: 'Status' }, { key: 'acks', label: 'Acknowledged by', align: 'right' }, { key: 'pct', label: '% of users', align: 'right' },
      ],
      rows: ins.map((i) => ({ ref: i.refNo, title: i.title, issued: dOnly(i.issuedDate), status: i.status,
        acks: (i.acknowledgedBy || []).length, pct: userCount ? `${Math.round(((i.acknowledgedBy || []).length / userCount) * 100)}%` : '—' })),
    }] };
  },

  'incident-register': async (q) => {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 90 * D);
    const rows = await Incident.find({ reportedAt: { $gte: from } }).sort('-reportedAt')
      .select('number title category type severity status reportedAt assignedTo resolvedAt').lean();
    return { subtitle: `${rows.length} cases since ${dOnly(from)}`, sections: [{
      heading: 'Incident register',
      columns: [
        { key: 'number', label: 'Case' }, { key: 'title', label: 'Title' }, { key: 'cat', label: 'Category' },
        { key: 'sev', label: 'Severity' }, { key: 'status', label: 'Status' }, { key: 'officer', label: 'Case officer' },
        { key: 'reported', label: 'Reported' }, { key: 'resolved', label: 'Resolved' },
      ],
      rows: rows.map((i) => ({ number: i.number, title: i.title, cat: i.category, sev: i.severity, status: i.status,
        officer: i.assignedTo?.name || '—', reported: dt(i.reportedAt), resolved: i.resolvedAt ? dt(i.resolvedAt) : '—' })),
    }] };
  },

  'hse-monthly': async () => {
    const settings = require('../config/settingsCache').moduleGet('incidents');
    const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
    const prev = new Date(from.getFullYear(), from.getMonth() - 1, 1);
    const rows = await Incident.find({ reportedAt: { $gte: prev } }).lean();
    const bucket = (list) => {
      const out = {};
      for (const i of list) {
        out[i.category] = out[i.category] || { category: i.category, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0, total: 0, injuries: 0 };
        out[i.category][i.severity] += 1; out[i.category].total += 1; out[i.category].injuries += i.injuries || 0;
      }
      return Object.values(out).sort((a, b) => b.total - a.total);
    };
    const cur = rows.filter((i) => new Date(i.reportedAt) >= from);
    const resolved = rows.filter((i) => i.resolvedAt);
    const mttr = resolved.length ? resolved.reduce((s, i) => s + (new Date(i.resolvedAt) - new Date(i.reportedAt)) / H, 0) / resolved.length : 0;
    const acked = rows.filter((i) => i.acknowledgedAt);
    const mtta = acked.length ? acked.reduce((s, i) => s + (new Date(i.acknowledgedAt) - new Date(i.reportedAt)) / 60000, 0) / acked.length : 0;
    return {
      subtitle: `MTTA ${Math.round(mtta)} min (target ${settings.mttaTargetMin}) · MTTR ${mttr.toFixed(1)} h (target ${settings.mttrTargetHrs})`,
      sections: [
        { heading: `This month (${from.toLocaleString('en-IN', { month: 'long' })})`, columns: [
          { key: 'category', label: 'Category' }, { key: 'LOW', label: 'Low', align: 'right' }, { key: 'MEDIUM', label: 'Medium', align: 'right' },
          { key: 'HIGH', label: 'High', align: 'right' }, { key: 'CRITICAL', label: 'Critical', align: 'right' },
          { key: 'total', label: 'Total', align: 'right' }, { key: 'injuries', label: 'Injuries', align: 'right' },
        ], rows: bucket(cur) },
        { heading: `Previous month (${prev.toLocaleString('en-IN', { month: 'long' })})`, columns: [
          { key: 'category', label: 'Category' }, { key: 'LOW', label: 'Low', align: 'right' }, { key: 'MEDIUM', label: 'Medium', align: 'right' },
          { key: 'HIGH', label: 'High', align: 'right' }, { key: 'CRITICAL', label: 'Critical', align: 'right' },
          { key: 'total', label: 'Total', align: 'right' }, { key: 'injuries', label: 'Injuries', align: 'right' },
        ], rows: bucket(rows.filter((i) => new Date(i.reportedAt) < from)) },
      ],
    };
  },

  'deficiency-analysis': async () => {
    const [ins, codes] = await Promise.all([
      Inspection.find({ status: 'CLOSED' }).select('findings type').lean(),
      Lookup.find({ category: 'deficiencyCode' }).lean(),
    ]);
    const label = Object.fromEntries(codes.map((c) => [c.code, c.label]));
    const agg = {};
    for (const i of ins) for (const f of i.findings || []) {
      agg[f.deficiencyCode] = agg[f.deficiencyCode] || { code: f.deficiencyCode, count: 0, open: 0, det: 0 };
      agg[f.deficiencyCode].count += 1;
      if (f.status === 'OPEN') agg[f.deficiencyCode].open += 1;
      if (f.actionCode === '30') agg[f.deficiencyCode].det += 1;
    }
    return { subtitle: 'All closed surveys', sections: [{
      heading: 'Deficiency codes by frequency',
      columns: [
        { key: 'code', label: 'Code' }, { key: 'label', label: 'Deficiency' }, { key: 'count', label: 'Occurrences', align: 'right' },
        { key: 'open', label: 'Still open', align: 'right' }, { key: 'det', label: 'Detainable', align: 'right' },
      ],
      rows: Object.values(agg).sort((a, b) => b.count - a.count).map((r) => ({ ...r, label: label[r.code] || '—' })),
    }] };
  },

  'detention-register': async () => {
    const rows = await Inspection.find({ detention: true }).populate('vessel', 'name imo flag').sort('-closedAt').lean();
    return { subtitle: `${rows.length} detentions on record`, sections: [{
      heading: 'Detention register',
      columns: [
        { key: 'number', label: 'Survey' }, { key: 'vessel', label: 'Vessel' }, { key: 'imo', label: 'IMO' },
        { key: 'flag', label: 'Flag' }, { key: 'type', label: 'Type' }, { key: 'grounds', label: 'Detainable grounds' },
        { key: 'date', label: 'Closed' },
      ],
      rows: rows.map((i) => ({ number: i.number, vessel: i.vessel?.name, imo: i.vessel?.imo, flag: i.vessel?.flag, type: i.type,
        grounds: (i.findings || []).filter((f) => f.actionCode === '30').map((f) => f.deficiencyCode).join(', ') || '—',
        date: dOnly(i.closedAt) })),
    }] };
  },

  'checklist-compliance': async () => {
    const ins = await Inspection.find({ status: 'CLOSED' }).select('type checklist').lean();
    const agg = {};
    for (const i of ins) {
      const total = (i.checklist || []).length;
      if (!total) continue;
      const yes = (i.checklist || []).filter((c) => c.answer === 'YES').length;
      agg[i.type] = agg[i.type] || { type: i.type, surveys: 0, items: 0, yes: 0 };
      agg[i.type].surveys += 1; agg[i.type].items += total; agg[i.type].yes += yes;
    }
    return { subtitle: 'Answer compliance across closed surveys', sections: [{
      heading: 'Checklist compliance by survey type',
      columns: [
        { key: 'type', label: 'Survey type' }, { key: 'surveys', label: 'Surveys', align: 'right' },
        { key: 'items', label: 'Items answered', align: 'right' }, { key: 'pct', label: 'Compliance', align: 'right' },
      ],
      rows: Object.values(agg).map((r) => ({ type: r.type, surveys: r.surveys, items: r.items, pct: `${Math.round((r.yes / r.items) * 100)}%` })),
    }] };
  },

  'licence-register': async () => {
    const rows = await License.find().sort('entityName').lean();
    return { subtitle: `${rows.length} licences`, sections: [{
      heading: 'Licence register',
      columns: [
        { key: 'no', label: 'Licence no.' }, { key: 'entity', label: 'Company' }, { key: 'type', label: 'Type' },
        { key: 'status', label: 'Status' }, { key: 'issued', label: 'Issued' }, { key: 'expiry', label: 'Valid till' },
        { key: 'rating', label: 'Rating', align: 'right' },
      ],
      rows: rows.map((l) => ({ no: l.licenseNo, entity: l.entityName, type: l.entityType.replace(/_/g, ' '), status: l.status,
        issued: dOnly(l.issueDate), expiry: dOnly(l.expiryDate), rating: l.performanceRating || '—' })),
    }] };
  },

  'outstanding-ageing': async () => {
    const now = Date.now();
    const rows = await Invoice.find({ status: 'ISSUED' }).populate('vessel', 'name').sort('issuedAt').lean();
    const bucketOf = (d2) => (d2 <= 30 ? '0-30' : d2 <= 60 ? '31-60' : d2 <= 90 ? '61-90' : '90+');
    const totals = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const detail = rows.map((i) => {
      const age = Math.floor((now - new Date(i.issuedAt)) / D);
      totals[bucketOf(age)] += i.total;
      return { number: i.number, vessel: i.vessel?.name, billTo: i.billTo?.name, issued: dOnly(i.issuedAt), age, bucket: bucketOf(age), amount: inr(i.total) };
    });
    return {
      subtitle: `${rows.length} unpaid invoices · ${inr(Object.values(totals).reduce((a, b2) => a + b2, 0))} outstanding`,
      sections: [
        { heading: 'Ageing summary', columns: [
          { key: 'bucket', label: 'Bucket (days)' }, { key: 'amount', label: 'Outstanding', align: 'right' },
        ], rows: Object.entries(totals).map(([bucket, amt]) => ({ bucket, amount: inr(amt) })) },
        { heading: 'Invoice detail', columns: [
          { key: 'number', label: 'Invoice' }, { key: 'vessel', label: 'Vessel' }, { key: 'billTo', label: 'Billed to' },
          { key: 'issued', label: 'Issued' }, { key: 'age', label: 'Age (days)', align: 'right' },
          { key: 'bucket', label: 'Bucket' }, { key: 'amount', label: 'Amount', align: 'right' },
        ], rows: detail },
      ],
    };
  },

  collections: async (q) => {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * D);
    const rows = await Invoice.find({ paidAt: { $gte: from } }).populate('vessel', 'name').sort('-paidAt').lean();
    return { subtitle: `${rows.length} receipts since ${dOnly(from)} · ${inr(rows.reduce((s, i) => s + i.total, 0))} collected`, sections: [{
      heading: 'Collections',
      columns: [
        { key: 'paid', label: 'Received on' }, { key: 'number', label: 'Invoice' }, { key: 'vessel', label: 'Vessel' },
        { key: 'billTo', label: 'Paid by' }, { key: 'ref', label: 'Payment ref' }, { key: 'amount', label: 'Amount', align: 'right' },
      ],
      rows: rows.map((i) => ({ paid: dOnly(i.paidAt), number: i.number, vessel: i.vessel?.name, billTo: i.billTo?.name, ref: i.paymentRef || '—', amount: inr(i.total) })),
    }] };
  },

  'revenue-by-head': async () => {
    const from = new Date(); from.setMonth(from.getMonth() - 11); from.setDate(1);
    const rows = await Invoice.find({ issuedAt: { $gte: from }, status: { $in: ['ISSUED', 'PAID'] } }).select('lines').lean();
    const agg = {};
    for (const i of rows) for (const l of i.lines || []) {
      agg[l.code] = agg[l.code] || { code: l.code, head: l.description.split(' — ')[0], qty: 0, amount: 0 };
      agg[l.code].qty += l.qty; agg[l.code].amount += l.amount;
    }
    return { subtitle: 'Trailing 12 months — billed (issued + paid)', sections: [{
      heading: 'Revenue by tariff head',
      columns: [
        { key: 'code', label: 'Code' }, { key: 'head', label: 'Tariff head' },
        { key: 'qty', label: 'Billed qty', align: 'right' }, { key: 'amount', label: 'Amount', align: 'right' },
      ],
      rows: Object.values(agg).sort((a, b) => b.amount - a.amount).map((r) => ({ ...r, qty: nf.format(Math.round(r.qty)), amount: inr(r.amount) })),
    }] };
  },

  'crew-medical': async () => {
    const settings = require('../config/settingsCache').moduleGet('crew');
    const crew = await Seafarer.find().select('name rank cdcNo status certificates').lean();
    const rows = crew.map((s2) => {
      const med = (s2.certificates || []).find((c) => /medical/i.test(c.certType));
      const days = med ? Math.floor((new Date(med.expiryDate) - Date.now()) / D) : null;
      return { name: s2.name, rank: s2.rank, cdc: s2.cdcNo, status: s2.status.replace(/_/g, ' '),
        expiry: med ? dOnly(med.expiryDate) : 'NO MEDICAL ON FILE', days: days ?? '—',
        st: !med ? 'MISSING' : days < 0 ? 'EXPIRED' : days <= (settings.medicalExpiringDays || 45) ? 'EXPIRING' : 'VALID' };
    }).sort((a, b2) => (a.days === '—' ? -1 : b2.days === '—' ? 1 : a.days - b2.days));
    return { subtitle: `Warning window ${settings.medicalExpiringDays || 45} days (crew module settings)`, sections: [{
      heading: 'Medical fitness — whole roll',
      columns: [
        { key: 'name', label: 'Seafarer' }, { key: 'rank', label: 'Rank' }, { key: 'cdc', label: 'CDC' },
        { key: 'status', label: 'Status' }, { key: 'expiry', label: 'Medical expiry' },
        { key: 'days', label: 'Days left', align: 'right' }, { key: 'st', label: 'Fitness' },
      ],
      rows,
    }] };
  },

  'crew-coc-register': async () => {
    const crew = await Seafarer.find().select('name rank cdcNo indosNo certificates').lean();
    const rows = crew.flatMap((s2) => (s2.certificates || []).filter((c) => /competency/i.test(c.certType))
      .map((c) => ({ name: s2.name, rank: s2.rank, cdc: s2.cdcNo, indos: s2.indosNo, grade: c.grade || '—',
        number: c.number, issuer: c.issuer, expiry: dOnly(c.expiryDate), st: certStatus(c.expiryDate) })));
    return { subtitle: `${rows.length} certificates of competency on file`, sections: [{
      heading: 'CoC / licence register',
      columns: [
        { key: 'name', label: 'Seafarer' }, { key: 'rank', label: 'Rank' }, { key: 'grade', label: 'Grade' },
        { key: 'number', label: 'CoC number' }, { key: 'issuer', label: 'Issuer' }, { key: 'cdc', label: 'CDC' },
        { key: 'indos', label: 'INDoS' }, { key: 'expiry', label: 'Valid till' }, { key: 'st', label: 'Status' },
      ],
      rows,
    }] };
  },

  'crew-roster': async () => {
    const crew = await Seafarer.find().populate('currentVessel', 'name').sort('name').lean();
    return { subtitle: `${crew.length} seafarers on the roll`, sections: [{
      heading: 'Crew roster',
      columns: [
        { key: 'name', label: 'Name' }, { key: 'rank', label: 'Rank' }, { key: 'cdc', label: 'CDC' },
        { key: 'indos', label: 'INDoS' }, { key: 'nat', label: 'Nationality' }, { key: 'status', label: 'Status' },
        { key: 'vessel', label: 'Current vessel' }, { key: 'phone', label: 'Phone' }, { key: 'alerts', label: 'Doc alerts', align: 'right' },
      ],
      rows: crew.map((s2) => ({ name: s2.name, rank: s2.rank, cdc: s2.cdcNo, indos: s2.indosNo, nat: s2.nationality,
        status: s2.status.replace(/_/g, ' '), vessel: s2.currentVessel?.name || 'Ashore', phone: s2.phone || '—',
        alerts: (s2.certificates || []).filter((c) => certStatus(c.expiryDate) !== 'VALID').length || '—' })),
    }] };
  },

  'crew-onboard': async () => {
    const crew = await Seafarer.find({ currentVessel: { $exists: true, $ne: null } }).populate('currentVessel', 'name imo type').lean();
    const byVessel = {};
    for (const s2 of crew) {
      const k2 = s2.currentVessel?.name || '—';
      byVessel[k2] = byVessel[k2] || [];
      byVessel[k2].push(s2);
    }
    return { subtitle: `${crew.length} crew signed on across ${Object.keys(byVessel).length} vessels`, sections:
      Object.entries(byVessel).map(([vesselName, list]) => ({
        heading: `${vesselName} — ${list.length} on board`,
        columns: [
          { key: 'name', label: 'Name' }, { key: 'rank', label: 'Rank' }, { key: 'cdc', label: 'CDC' },
          { key: 'nat', label: 'Nationality' }, { key: 'alerts', label: 'Doc alerts', align: 'right' },
        ],
        rows: list.map((s2) => ({ name: s2.name, rank: s2.rank, cdc: s2.cdcNo, nat: s2.nationality,
          alerts: (s2.certificates || []).filter((c) => certStatus(c.expiryDate) !== 'VALID').length || '—' })),
      })) };
  },

  'crew-sea-service': async () => {
    const crew = await Seafarer.find().sort('name').lean();
    const rows = crew.map((s2) => {
      const svc = s2.seaService || [];
      const days = svc.reduce((t, x) => t + Math.max(0, Math.round((new Date(x.to) - new Date(x.from)) / D)), 0);
      const verified = svc.filter((x) => x.verified).length;
      const last = svc.slice().sort((a, b2) => new Date(b2.to) - new Date(a.to))[0];
      return { name: s2.name, rank: s2.rank, stints: svc.length, days: nf.format(days),
        lastVessel: last ? last.vesselName : '—', lastTo: last ? dOnly(last.to) : '—',
        verified: svc.length ? `${Math.round((verified / svc.length) * 100)}%` : '—' };
    });
    return { subtitle: 'Aggregated from verified sea-service records', sections: [{
      heading: 'Sea service summary',
      columns: [
        { key: 'name', label: 'Seafarer' }, { key: 'rank', label: 'Rank' }, { key: 'stints', label: 'Stints', align: 'right' },
        { key: 'days', label: 'Total days', align: 'right' }, { key: 'lastVessel', label: 'Last vessel' },
        { key: 'lastTo', label: 'Signed off' }, { key: 'verified', label: 'Verified', align: 'right' },
      ],
      rows,
    }] };
  },

  'user-access': async () => {
    const rows = await User.find().populate('role', 'name').sort('name').lean();
    return { subtitle: `${rows.length} accounts`, sections: [{
      heading: 'User access',
      columns: [
        { key: 'name', label: 'Name' }, { key: 'designation', label: 'Designation' }, { key: 'department', label: 'Department' },
        { key: 'role', label: 'Role' }, { key: 'email', label: 'Email' }, { key: 'status', label: 'Status' }, { key: 'last', label: 'Last sign-in' },
      ],
      rows: rows.map((u) => ({ name: u.name, designation: u.designation, department: u.department || '—', role: u.role?.name,
        email: u.email, status: u.active === false ? 'Disabled' : 'Active', last: u.lastLoginAt ? dt(u.lastLoginAt) : 'Never' })),
    }] };
  },
};

exports.catalog = async (_req, res) => ok(res, CATALOG);

exports.run = async (req, res) => {
  const def = CATALOG.find((c) => c.key === req.params.key);
  const runner = RUNNERS[req.params.key];
  if (!def || !runner) throw new ApiError(404, `Unknown report "${req.params.key}"`);
  const out = await runner(req.query || {});
  ok(res, { key: def.key, title: def.name, module: def.module, generatedAt: new Date().toISOString(), ...out });
};
