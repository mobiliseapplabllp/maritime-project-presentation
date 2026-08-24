/* Per-module stat cards — the small dashboards shown at the top of every page. */
const { PortCall, Berth, Vessel, Seafarer, Instrument, License, Inspection, Incident, Invoice, User, TariffItem, Lookup, ChecklistTemplate, Resource, AuditLog } = require('../models');
const { certStatus } = require('../domain/certStatus');
const { ApiError, ok } = require('../utils/respond');

const H = 3600 * 1000, D = 24 * H;
const card = (label, value, sub, tone) => ({ label, value, sub: sub || '', tone: tone || 'default' });
const inr = (n) => {
  const abs = Math.abs(n || 0);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${new Intl.NumberFormat('en-IN').format(Math.round(n || 0))}`;
};

const SCOPES = {
  portcalls: { perm: 'portcalls.view', compute: async () => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const active = await PortCall.find({ status: { $in: ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'] } }).select('status eta').lean();
    const sailed30 = await PortCall.find({ status: 'SAILED', atd: { $gte: new Date(now - 30 * D) } }).select('ata atb atd').lean();
    const avg = (rows, from, to) => (rows.length
      ? Math.round(rows.reduce((s, c) => s + (new Date(c[to]) - new Date(c[from])), 0) / rows.length / H * 10) / 10 : 0);
    const turn = avg(sailed30, 'ata', 'atd');
    const wait = avg(sailed30.filter((c) => c.atb), 'ata', 'atb');

    const [total, sailedTotal, ytd, first] = await Promise.all([
      PortCall.countDocuments(),
      PortCall.countDocuments({ status: 'SAILED' }),
      PortCall.countDocuments({ status: 'SAILED', atd: { $gte: yearStart } }),
      PortCall.findOne({ status: 'SAILED' }).sort({ atd: 1 }).select('atd').lean(),
    ]);
    const since = first && first.atd
      ? new Date(first.atd).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—';

    // cargo moved this month, from the calls that completed in it
    const mtd = await PortCall.find({ status: 'SAILED', atd: { $gte: monthStart } }).select('cargoOps').lean();
    let mt = 0, teu = 0;
    for (const c of mtd) {
      for (const o of c.cargoOps || []) {
        mt += o.qtyMT || 0;
        if (o.unit === 'TEU') teu += o.qty || 0;
      }
    }
    const mmt = mt >= 1e6 ? `${(mt / 1e6).toFixed(2)} M MT` : `${new Intl.NumberFormat('en-IN').format(Math.round(mt))} MT`;
    const nf = (n) => new Intl.NumberFormat('en-IN').format(n);

    return [
      card('At berth', active.filter((c) => c.status === 'BERTHED').length, 'working cargo now', 'success'),
      card('At anchorage', active.filter((c) => c.status === 'AT_ANCHORAGE').length, 'awaiting berth', 'warning'),
      card('Expected 72 h', active.filter((c) => ['ANNOUNCED', 'CONFIRMED'].includes(c.status) && new Date(c.eta) > now && new Date(c.eta) < new Date(now.getTime() + 72 * H)).length, 'announced + confirmed'),
      card('Avg turnaround', `${turn} h`, 'sailed calls, 30 days'),
      card('Total port calls', nf(total), `on record since ${since}`),
      card('Calls sailed', nf(sailedTotal), `${nf(ytd)} in ${now.getFullYear()}`),
      card('Cargo this month', mmt, teu ? `${nf(teu)} TEU handled` : 'across all commodities'),
      card('Avg pre-berthing wait', `${wait} h`, 'anchorage to berth, 30 days',
        wait > 24 ? 'warning' : 'default'),
    ];
  } },
  berths: { perm: 'portcalls.view', compute: async () => {
    const [berths, berthed] = await Promise.all([
      Berth.find().lean(),
      PortCall.find({ status: 'BERTHED' }).select('berth').lean(),
    ]);
    const op = berths.filter((b) => b.status === 'OPERATIONAL');
    const occ = new Set(berthed.map((c) => String(c.berth))).size;
    const since12 = new Date(Date.now() - 365 * D);
    const out12 = berths.flatMap((b) => (b.outages || []).filter((o) => new Date(o.from) >= since12));
    const outDays = Math.round(out12.reduce((sm, o) => sm + (o.days || 0), 0));
    const avail = berths.length ? Math.max(0, Math.round((1 - outDays / (berths.length * 365)) * 1000) / 10) : 100;
    return [
      card('Berths', berths.length, `${berths.length - op.length} under maintenance`),
      card('Occupied now', occ, 'vessels alongside', 'success'),
      card('Occupancy', `${op.length ? Math.round((occ / op.length) * 100) : 0}%`, 'of operational berths'),
      card('Free & operational', op.length - occ, 'ready for allocation'),
      card('Longest quay', `${Math.max(...berths.map((b) => b.loaMax || 0))} m`, 'max LOA accepted'),
      card('Deepest berth', `${Math.max(...berths.map((b) => b.draftMax || 0))} m`, 'max declared draft'),
      card('Outages (12 m)', out12.length, `${outDays} days lost`, out12.length ? 'warning' : 'success'),
      card('Berth availability', `${avail}%`, 'operational time, 12 months', avail < 95 ? 'warning' : 'success'),
    ];
  } },
  vessels: { perm: 'vessels.view', compute: async () => {
    const vessels = await Vessel.find().select('status built certificates type liner name nextDryDock').lean();
    const nfv = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
    const callAgg = await PortCall.find().select('vessel').lean();
    const callCount = callAgg.length;
    const byV = {};
    callAgg.forEach((c) => { byV[String(c.vessel)] = (byV[String(c.vessel)] || 0) + 1; });
    const topId = Object.keys(byV).sort((a, b) => byV[b] - byV[a])[0];
    const topV = vessels.find((v) => String(v._id) === topId);
    const top = topV ? { name: topV.name, n: byV[topId] } : null;
    const dueDock = vessels.filter((v) => v.nextDryDock
      && new Date(v.nextDryDock) < new Date(Date.now() + 182 * D)).length;
    const active = vessels.filter((v) => v.status === 'ACTIVE');
    const alerts = active.filter((v) => (v.certificates || []).some((c) => certStatus(c.expiryDate) !== 'VALID')).length;
    const year = new Date().getFullYear();
    const avgAge = active.length ? Math.round(active.reduce((s, v) => s + (year - (v.built || year)), 0) / active.length) : 0;
    return [
      card('Active vessels', active.length, `${vessels.length - active.length} inactive`),
      card('Certificate alerts', alerts, 'vessels needing review', alerts ? 'warning' : 'success'),
      card('Average age', `${avgAge} yrs`, 'active fleet'),
      card('Vessel types', new Set(active.map((v) => v.type)).size, 'in the registry'),
      card('Calls on record', nfv(callCount), 'by these vessels'),
      card('Busiest caller', top ? top.name : '—', top ? `${top.n} calls` : ''),
      card('Dry dock ≤6 m', dueDock, 'class survey window', dueDock ? 'warning' : 'success'),
      card('Liner callers', vessels.filter((v) => v.liner).length, 'documented scheduled services'),
    ];
  } },
  certificates: { perm: 'certificates.view', compute: async () => {
    const vessels = await Vessel.find({ status: 'ACTIVE' }).select('certificates').lean();
    const all = vessels.flatMap((v) => (v.certificates || []).map((c) => certStatus(c.expiryDate)));
    return [
      card('Certificates', all.length, 'across active fleet'),
      card('Valid', all.filter((x) => x === 'VALID').length, '', 'success'),
      card('Expiring ≤30 d', all.filter((x) => x === 'EXPIRING').length, 'plan renewals', 'warning'),
      card('Expired', all.filter((x) => x === 'EXPIRED').length, 'immediate action', 'error'),
      card('Vessels covered', vessels.length, 'active fleet'),
      card('Certificate types', new Set(vessels.flatMap((v) => (v.certificates || []).map((c) => c.certType))).size, 'distinct instruments'),
      card('Avg per vessel', vessels.length ? Math.round(all.length / vessels.length * 10) / 10 : 0, 'certificates held'),
      card('Renewals ≤90 d', vessels.flatMap((v) => v.certificates || []).filter((c) => c.expiryDate
        && new Date(c.expiryDate) > new Date() && new Date(c.expiryDate) < new Date(Date.now() + 90 * D)).length, 'plan survey slots'),
    ];
  } },
  seafarers: { perm: 'seafarers.view', compute: async () => {
    const sf = await Seafarer.find().select('status certificates currentVessel seaService rank nationality').lean();
    const nfs = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
    const stints = sf.reduce((sm, x) => sm + (x.seaService || []).length, 0);
    const alerts = sf.filter((x) => (x.certificates || []).some((c) => certStatus(c.expiryDate) !== 'VALID')).length;
    const avgDays = sf.length ? Math.round(sf.reduce((s, x) => s + (x.seaService || []).reduce((a, y) => a + (new Date(y.to) - new Date(y.from)) / D, 0), 0) / sf.length) : 0;
    return [
      card('Registered', sf.length, 'seafarers on the roll'),
      card('On board', sf.filter((x) => x.currentVessel).length, 'currently assigned', 'success'),
      card('Certificate alerts', alerts, 'medical / STCW review', alerts ? 'warning' : 'success'),
      card('Avg sea service', `${new Intl.NumberFormat('en-IN').format(avgDays)} d`, 'per seafarer'),
      card('Service records', nfs(stints), 'contracts on file'),
      card('Ranks represented', new Set(sf.map((x) => x.rank)).size, 'across the roll'),
      card('Ashore', sf.filter((x) => !x.currentVessel).length, 'available for assignment'),
      card('Nationalities', new Set(sf.map((x) => x.nationality).filter(Boolean)).size, 'on the register'),
    ];
  } },
  legislation: { perm: 'legislation.view', compute: async (req) => {
    const ins = await Instrument.find().select('status type issuedDate ackRequired acknowledgedBy').lean();
    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const uid = String(req.user.id);
    const pendingMine = ins.filter((i) => i.ackRequired && i.status === 'IN_FORCE' && !(i.acknowledgedBy || []).some((a) => a.userId === uid)).length;
    return [
      card('In force', ins.filter((i) => i.status === 'IN_FORCE').length, 'instruments'),
      card('Issued this year', ins.filter((i) => i.issuedDate && new Date(i.issuedDate) >= yearStart).length, 'circulars & notices'),
      card('Need acknowledgment', ins.filter((i) => i.ackRequired && i.status === 'IN_FORCE').length, 'organisation-wide'),
      card('Pending — you', pendingMine, 'awaiting your acknowledgment', pendingMine ? 'warning' : 'success'),
      card('Total register', ins.length, 'acts, rules, notices, circulars'),
      card('Superseded', ins.filter((i) => i.status === 'SUPERSEDED').length, 'replaced by later issues'),
      card('Withdrawn', ins.filter((i) => i.status === 'WITHDRAWN').length, 'no longer in effect'),
      card('Instrument types', new Set(ins.map((i) => i.type)).size, 'in the register'),
    ];
  } },
  facilities: { perm: 'facilities.view', compute: async () => {
    const lic = await License.find().select('status expiryDate entityType appliedDate performanceRating audits').lean();
    const nfl = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
    const applied = lic.map((l) => l.appliedDate).filter(Boolean).map((d) => new Date(d));
    const firstLic = applied.length
      ? new Date(Math.min(...applied)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—';
    const rated = lic.filter((l) => l.performanceRating > 0);
    const avgRate = rated.length ? Math.round(rated.reduce((sm, l) => sm + l.performanceRating, 0) / rated.length * 10) / 10 : 0;
    const auditsN = lic.reduce((sm, l) => sm + (l.audits || []).length, 0);
    const soon = lic.filter((l) => l.status === 'ISSUED' && l.expiryDate && new Date(l.expiryDate) < new Date(Date.now() + 90 * D)).length;
    return [
      card('Issued', lic.filter((l) => l.status === 'ISSUED').length, 'active licences', 'success'),
      card('In pipeline', lic.filter((l) => ['APPLIED', 'UNDER_REVIEW'].includes(l.status)).length, 'applied / under review'),
      card('Suspended / revoked', lic.filter((l) => ['SUSPENDED', 'REVOKED'].includes(l.status)).length, 'enforcement actions', 'warning'),
      card('Expiring ≤90 d', soon, 'renewals due', soon ? 'warning' : 'success'),
      card('Licences on record', lic.length, `since ${firstLic}`),
      card('Categories', new Set(lic.map((l) => l.entityType)).size, 'classes of operator'),
      card('Avg rating', avgRate ? `${avgRate} / 5` : '—', 'performance across issued'),
      card('Audits logged', nfl(auditsN), 'annual safety audits'),
    ];
  } },
  inspections: { perm: 'inspections.view', compute: async () => {
    const now = new Date();
    const ins = await Inspection.find().select('status result detention closedAt startedAt findings').lean();
    const nfi = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
    const started = ins.map((i) => i.startedAt).filter(Boolean).map((d) => new Date(d));
    const firstIns = started.length
      ? new Date(Math.min(...started)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—';
    const closed = ins.filter((i) => i.status === 'CLOSED');
    const detRate = closed.length ? Math.round(closed.filter((i) => i.detention).length / closed.length * 1000) / 10 : 0;
    const satPct = closed.length ? Math.round(closed.filter((i) => i.result === 'SATISFACTORY').length / closed.length * 100) : 0;
    const totalF = ins.reduce((sm, i) => sm + (i.findings || []).length, 0);
    const openF = ins.reduce((s, i) => s + (i.findings || []).filter((f) => f.status === 'OPEN').length, 0);
    return [
      card('Open inspections', ins.filter((i) => i.status !== 'CLOSED').length, 'planned + in progress'),
      card('Closed this month', ins.filter((i) => i.closedAt && new Date(i.closedAt) >= new Date(now.getFullYear(), now.getMonth(), 1)).length, ''),
      card('Open findings', openF, 'deficiencies to rectify', openF ? 'warning' : 'success'),
      card('Detentions YTD', ins.filter((i) => i.detention && i.closedAt && new Date(i.closedAt) >= new Date(now.getFullYear(), 0, 1)).length, '', 'error'),
      card('Inspections on record', nfi(ins.length), `since ${firstIns}`),
      card('Detention rate', `${detRate}%`, 'of closed inspections', detRate > 8 ? 'warning' : 'success'),
      card('Findings raised', nfi(totalF), `${nfi(totalF - openF)} rectified`),
      card('Satisfactory', `${satPct}%`, 'closed with no deficiency', 'success'),
    ];
  } },
  incidents: { perm: 'incidents.view', compute: async () => {
    const now = new Date();
    const inc = await Incident.find().select('status severity closedAt reportedAt type').lean();
    const nfc = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
    const rep0 = inc.map((i) => i.reportedAt).filter(Boolean).map((d) => new Date(d));
    const firstInc = rep0.length
      ? new Date(Math.min(...rep0)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—';
    const done = inc.filter((i) => i.closedAt && i.reportedAt);
    const closePct = inc.length ? Math.round(inc.filter((i) => i.status === 'CLOSED').length / inc.length * 100) : 0;
    const avgClose = done.length
      ? Math.round(done.reduce((sm, i) => sm + (new Date(i.closedAt) - new Date(i.reportedAt)), 0) / done.length / D * 10) / 10 : 0;
    return [
      card('Open / unacknowledged', inc.filter((i) => ['OPEN', 'ACKNOWLEDGED'].includes(i.status)).length, 'awaiting response', 'error'),
      card('In response', inc.filter((i) => ['RESPONDING', 'MONITORING'].includes(i.status)).length, 'assets tasked', 'warning'),
      card('Closed this month', inc.filter((i) => i.closedAt && new Date(i.closedAt) >= new Date(now.getFullYear(), now.getMonth(), 1)).length, '', 'success'),
      card('High severity YTD', inc.filter((i) => ['HIGH', 'CRITICAL'].includes(i.severity) && new Date(i.reportedAt) >= new Date(now.getFullYear(), 0, 1)).length, 'high + critical'),
      card('Cases on record', nfc(inc.length), `since ${firstInc}`),
      card('Closed', nfc(inc.filter((i) => i.status === 'CLOSED').length), `${closePct}% of all cases`, 'success'),
      card('Near misses', nfc(inc.filter((i) => i.type === 'NEAR_MISS').length), 'reported — a good sign'),
      card('Avg close time', avgClose ? `${avgClose} d` : '—', 'report to closure'),
    ];
  } },
  invoices: { perm: 'invoices.view', compute: async () => {
    const now = new Date();
    const inv = await Invoice.find().select('status total issuedAt paidAt').lean();
    const nfin = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
    const issued = inv.filter((i) => i.issuedAt);
    const firstInv = issued.length
      ? new Date(Math.min(...issued.map((i) => new Date(i.issuedAt)))).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—';
    const billedAll = issued.reduce((sm, i) => sm + i.total, 0);
    const collected = inv.filter((i) => i.paidAt).reduce((sm, i) => sm + i.total, 0);
    const collPct = billedAll ? Math.round(collected / billedAll * 1000) / 10 : 0;
    const billedYtd = issued.filter((i) => new Date(i.issuedAt) >= new Date(now.getFullYear(), 0, 1))
      .reduce((sm, i) => sm + i.total, 0);
    const out = inv.filter((i) => i.status === 'ISSUED');
    const overdue = out.filter((i) => i.issuedAt && now - new Date(i.issuedAt) > 30 * D);
    return [
      card('Outstanding', inr(out.reduce((s, i) => s + i.total, 0)), `${out.length} issued invoices`, 'warning'),
      card('Overdue >30 d', overdue.length, inr(overdue.reduce((s, i) => s + i.total, 0)), overdue.length ? 'error' : 'success'),
      card('Drafts', inv.filter((i) => i.status === 'DRAFT').length, 'awaiting issue'),
      card('Collected MTD', inr(inv.filter((i) => i.paidAt && new Date(i.paidAt) >= new Date(now.getFullYear(), now.getMonth(), 1)).reduce((s, i) => s + i.total, 0)), '', 'success'),
      card('Invoices raised', nfin(inv.length), `since ${firstInv}`),
      card('Billed to date', inr(billedAll), 'issued + paid, all years'),
      card('Collection rate', `${collPct}%`, 'of everything billed', collPct >= 95 ? 'success' : 'warning'),
      card('Billed YTD', inr(billedYtd), `${now.getFullYear()} to date`),
    ];
  } },
  risk: { perm: 'risk.view', compute: async () => {
    const { computeScores } = require('./riskController');
    const { rows } = await computeScores();
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length) : 0;
    return [
      card('High risk', rows.filter((r) => r.band === 'HIGH').length, 'priority targets', 'error'),
      card('Medium risk', rows.filter((r) => r.band === 'MEDIUM').length, '', 'warning'),
      card('Low risk', rows.filter((r) => r.band === 'LOW').length, '', 'success'),
      card('Fleet average', avg, 'score across active fleet'),
    ];
  } },
  masters: { perm: 'masters.view', compute: async () => {
    const [b, l, t, c] = await Promise.all([
      Berth.countDocuments(), Lookup.countDocuments(), TariffItem.countDocuments({ active: true }), ChecklistTemplate.countDocuments(),
    ]);
    const nfm = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
    const [lookups, tariffs, tpls, craft] = await Promise.all([
      Lookup.find().select('category').lean(),
      TariffItem.find().select('revisions').lean(),
      ChecklistTemplate.find().select('items').lean(),
      Resource.countDocuments(),
    ]);
    const cats = new Set(lookups.map((x) => x.category)).size;
    const revs = tariffs.reduce((sm, x) => sm + (x.revisions || []).length, 0);
    const qs = tpls.reduce((sm, x) => sm + (x.items || []).length, 0);
    return [
      card('Berths', b), card('Lookup entries', l), card('Active tariffs', t), card('Checklist templates', c),
      card('Reference categories', cats, 'distinct lookup sets'),
      card('Tariff revisions', nfm(revs), 'rate changes published'),
      card('Checklist questions', nfm(qs), 'across all templates'),
      card('Marine craft', craft, 'tugs, launches, pilots'),
    ];
  } },
  users: { perm: 'users.view', compute: async () => {
    const users = await User.find().select('active lastLoginAt department role').lean();
    const dormant = users.filter((u) => u.lastLoginAt && Date.now() - new Date(u.lastLoginAt) > 90 * D).length;
    return [
      card('Users', users.length, 'accounts'),
      card('Active', users.filter((u) => u.active).length, '', 'success'),
      card('Disabled', users.filter((u) => !u.active).length, ''),
      card('Signed in ≤7 d', users.filter((u) => u.lastLoginAt && Date.now() - new Date(u.lastLoginAt) < 7 * D).length, 'recent activity'),
      card('Departments', new Set(users.map((u) => u.department).filter(Boolean)).size, 'represented'),
      card('Roles in use', new Set(users.map((u) => String(u.role)).filter(Boolean)).size, 'distinct permission sets'),
      card('Never signed in', users.filter((u) => !u.lastLoginAt).length, 'accounts pending first use'),
      card('Dormant >90 d', dormant, 'candidates for review', dormant ? 'warning' : 'success'),
    ];
  } },
  tariffs: { perm: 'tariffs.view', compute: async () => {
    const items = await TariffItem.find().select('category unit active revisions code').lean();
    const nft = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
    const revs = items.flatMap((t) => (t.revisions || []).map((r) => ({ ...r, code: t.code })));
    const dated = revs.filter((r) => r.effectiveFrom).sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom));
    const firstRev = dated.length ? new Date(dated[0].effectiveFrom).getFullYear() : '—';
    const last = dated[dated.length - 1];
    const rises = revs.filter((r) => typeof r.changePct === 'number');
    const avgRise = rises.length ? Math.round((rises.reduce((sm, r) => sm + r.changePct, 0) / rises.length) * 10) / 10 : 0;
    return [
      card('Tariff items', items.length, 'published schedule'),
      card('Active', items.filter((t) => t.active !== false).length, 'currently chargeable', 'success'),
      card('Rate revisions', nft(revs.length), `published since ${firstRev}`),
      card('Last revision', last ? new Date(last.effectiveFrom).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
        last ? `${last.code} ${last.changePct > 0 ? '+' : ''}${last.changePct}%` : ''),
      card('Avg revision', `${avgRise > 0 ? '+' : ''}${avgRise}%`, 'per published change'),
      card('Marine services', items.filter((t) => t.category === 'MARINE').length, 'pilotage, towage, dues'),
      card('Cargo tariffs', items.filter((t) => t.category === 'CARGO').length, 'handling & storage'),
      card('Charging units', new Set(items.map((t) => t.unit)).size, 'distinct bases of charge'),
    ];
  } },
  marine: { perm: 'portcalls.view', compute: async () => {
    const now = new Date();
    const craft = await Resource.find().select('status type jobs outages').lean();
    const nfr = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
    const jobs = craft.flatMap((r) => r.jobs || []);
    const dated = jobs.filter((j) => j.at).map((j) => new Date(j.at));
    const firstJob = dated.length
      ? new Date(Math.min(...dated)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—';
    const j30 = jobs.filter((j) => j.at && new Date(j.at) >= new Date(now - 30 * D)).length;
    const hours = jobs.reduce((sm, j) => sm + (j.hours || 0), 0);
    const since12 = new Date(now - 365 * D);
    const outDays = craft.reduce((sm, r) => sm
      + (r.outages || []).filter((o) => new Date(o.from) >= since12).reduce((t, o) => t + (o.days || 0), 0), 0);
    const avail = craft.length ? Math.max(0, Math.round((1 - outDays / (craft.length * 365)) * 1000) / 10) : 100;
    return [
      card('Craft & pilots', craft.length, 'on the port roster'),
      card('Available', craft.filter((r) => r.status === 'AVAILABLE').length, 'ready to task', 'success'),
      card('Tasked now', craft.filter((r) => r.status === 'TASKED').length, 'on a job', 'warning'),
      card('Maintenance', craft.filter((r) => r.status === 'MAINTENANCE').length, 'survey or repair'),
      card('Jobs on record', nfr(jobs.length), `since ${firstJob}`),
      card('Assist hours', nfr(Math.round(hours)), 'logged across the fleet'),
      card('Jobs (30 d)', nfr(j30), 'recent taskings'),
      card('Fleet availability', `${avail}%`, `${Math.round(outDays)} craft-days lost, 12 m`, avail < 95 ? 'warning' : 'success'),
    ];
  } },
  audit: { perm: 'audit.view', compute: async () => {
    const now = new Date();
    const rows = await AuditLog.find().select('at action entity actor').lean();
    const nfa = (n) => new Intl.NumberFormat('en-IN').format(n || 0);
    const ats = rows.filter((r) => r.at).map((r) => new Date(r.at));
    const firstAt = ats.length
      ? new Date(Math.min(...ats)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—';
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d7 = new Date(now - 7 * D), d30 = new Date(now - 30 * D);
    const byEntity = {};
    rows.forEach((r) => { byEntity[r.entity] = (byEntity[r.entity] || 0) + 1; });
    const topEntity = Object.keys(byEntity).sort((a, b) => byEntity[b] - byEntity[a])[0];
    const CHANGE = ['CREATE', 'UPDATE', 'DELETE'];
    return [
      card('Entries', nfa(rows.length), `since ${firstAt}`),
      card('Today', nfa(rows.filter((r) => new Date(r.at) >= dayStart).length), 'recorded so far'),
      card('Last 7 days', nfa(rows.filter((r) => new Date(r.at) >= d7).length), 'rolling week'),
      card('Active users', new Set(rows.filter((r) => new Date(r.at) >= d30).map((r) => r.actor && r.actor.id).filter(Boolean)).size, 'left a trail in 30 days'),
      card('Entities covered', Object.keys(byEntity).length, 'modules under audit'),
      card('Sign-ins (30 d)', nfa(rows.filter((r) => r.action === 'LOGIN' && new Date(r.at) >= d30).length), 'authenticated sessions'),
      card('Changes (30 d)', nfa(rows.filter((r) => CHANGE.includes(r.action) && new Date(r.at) >= d30).length), 'create, update, delete'),
      card('Most-touched', topEntity || '—', topEntity ? `${nfa(byEntity[topEntity])} entries` : ''),
    ];
  } },
};

exports.SCOPES = SCOPES;
exports.get = async (req, res) => {
  const scope = SCOPES[req.params.scope];
  if (!scope) throw new ApiError(404, `Unknown stats scope "${req.params.scope}"`);
  ok(res, { cards: await scope.compute(req) });
};
