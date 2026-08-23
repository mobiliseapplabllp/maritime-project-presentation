/* Per-module stat cards — the small dashboards shown at the top of every page. */
const { PortCall, Berth, Vessel, Seafarer, Instrument, License, Inspection, Incident, Invoice, User, TariffItem, Lookup, ChecklistTemplate } = require('../models');
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
    const active = await PortCall.find({ status: { $in: ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'] } }).select('status eta').lean();
    const sailed30 = await PortCall.find({ status: 'SAILED', atd: { $gte: new Date(now - 30 * D) } }).select('ata atd').lean();
    const turn = sailed30.length ? Math.round(sailed30.reduce((s, c) => s + (new Date(c.atd) - new Date(c.ata)), 0) / sailed30.length / H * 10) / 10 : 0;
    return [
      card('At berth', active.filter((c) => c.status === 'BERTHED').length, 'working cargo now', 'success'),
      card('At anchorage', active.filter((c) => c.status === 'AT_ANCHORAGE').length, 'awaiting berth', 'warning'),
      card('Expected 72 h', active.filter((c) => ['ANNOUNCED', 'CONFIRMED'].includes(c.status) && new Date(c.eta) > now && new Date(c.eta) < new Date(now.getTime() + 72 * H)).length, 'announced + confirmed'),
      card('Avg turnaround', `${turn} h`, 'sailed calls, 30 days'),
    ];
  } },
  berths: { perm: 'portcalls.view', compute: async () => {
    const [berths, berthed] = await Promise.all([
      Berth.find().lean(),
      PortCall.find({ status: 'BERTHED' }).select('berth').lean(),
    ]);
    const op = berths.filter((b) => b.status === 'OPERATIONAL');
    const occ = new Set(berthed.map((c) => String(c.berth))).size;
    return [
      card('Berths', berths.length, `${berths.length - op.length} under maintenance`),
      card('Occupied now', occ, 'vessels alongside', 'success'),
      card('Occupancy', `${op.length ? Math.round((occ / op.length) * 100) : 0}%`, 'of operational berths'),
      card('Free & operational', op.length - occ, 'ready for allocation'),
    ];
  } },
  vessels: { perm: 'vessels.view', compute: async () => {
    const vessels = await Vessel.find().select('status built certificates type').lean();
    const active = vessels.filter((v) => v.status === 'ACTIVE');
    const alerts = active.filter((v) => (v.certificates || []).some((c) => certStatus(c.expiryDate) !== 'VALID')).length;
    const year = new Date().getFullYear();
    const avgAge = active.length ? Math.round(active.reduce((s, v) => s + (year - (v.built || year)), 0) / active.length) : 0;
    return [
      card('Active vessels', active.length, `${vessels.length - active.length} inactive`),
      card('Certificate alerts', alerts, 'vessels needing review', alerts ? 'warning' : 'success'),
      card('Average age', `${avgAge} yrs`, 'active fleet'),
      card('Vessel types', new Set(active.map((v) => v.type)).size, 'in the registry'),
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
    ];
  } },
  seafarers: { perm: 'seafarers.view', compute: async () => {
    const sf = await Seafarer.find().select('status certificates currentVessel seaService').lean();
    const alerts = sf.filter((x) => (x.certificates || []).some((c) => certStatus(c.expiryDate) !== 'VALID')).length;
    const avgDays = sf.length ? Math.round(sf.reduce((s, x) => s + (x.seaService || []).reduce((a, y) => a + (new Date(y.to) - new Date(y.from)) / D, 0), 0) / sf.length) : 0;
    return [
      card('Registered', sf.length, 'seafarers on the roll'),
      card('On board', sf.filter((x) => x.currentVessel).length, 'currently assigned', 'success'),
      card('Certificate alerts', alerts, 'medical / STCW review', alerts ? 'warning' : 'success'),
      card('Avg sea service', `${new Intl.NumberFormat('en-IN').format(avgDays)} d`, 'per seafarer'),
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
    ];
  } },
  facilities: { perm: 'facilities.view', compute: async () => {
    const lic = await License.find().select('status expiryDate').lean();
    const soon = lic.filter((l) => l.status === 'ISSUED' && l.expiryDate && new Date(l.expiryDate) < new Date(Date.now() + 90 * D)).length;
    return [
      card('Issued', lic.filter((l) => l.status === 'ISSUED').length, 'active licences', 'success'),
      card('In pipeline', lic.filter((l) => ['APPLIED', 'UNDER_REVIEW'].includes(l.status)).length, 'applied / under review'),
      card('Suspended / revoked', lic.filter((l) => ['SUSPENDED', 'REVOKED'].includes(l.status)).length, 'enforcement actions', 'warning'),
      card('Expiring ≤90 d', soon, 'renewals due', soon ? 'warning' : 'success'),
    ];
  } },
  inspections: { perm: 'inspections.view', compute: async () => {
    const now = new Date();
    const ins = await Inspection.find().select('status result detention closedAt findings').lean();
    const openF = ins.reduce((s, i) => s + (i.findings || []).filter((f) => f.status === 'OPEN').length, 0);
    return [
      card('Open inspections', ins.filter((i) => i.status !== 'CLOSED').length, 'planned + in progress'),
      card('Closed this month', ins.filter((i) => i.closedAt && new Date(i.closedAt) >= new Date(now.getFullYear(), now.getMonth(), 1)).length, ''),
      card('Open findings', openF, 'deficiencies to rectify', openF ? 'warning' : 'success'),
      card('Detentions YTD', ins.filter((i) => i.detention && i.closedAt && new Date(i.closedAt) >= new Date(now.getFullYear(), 0, 1)).length, '', 'error'),
    ];
  } },
  incidents: { perm: 'nmc.view', compute: async () => {
    const now = new Date();
    const inc = await Incident.find().select('status severity closedAt reportedAt').lean();
    return [
      card('Open', inc.filter((i) => i.status === 'OPEN').length, 'awaiting response', 'error'),
      card('Responding', inc.filter((i) => i.status === 'RESPONDING').length, 'assets tasked', 'warning'),
      card('Closed this month', inc.filter((i) => i.closedAt && new Date(i.closedAt) >= new Date(now.getFullYear(), now.getMonth(), 1)).length, '', 'success'),
      card('High severity YTD', inc.filter((i) => ['HIGH', 'CRITICAL'].includes(i.severity) && new Date(i.reportedAt) >= new Date(now.getFullYear(), 0, 1)).length, 'high + critical'),
    ];
  } },
  invoices: { perm: 'invoices.view', compute: async () => {
    const now = new Date();
    const inv = await Invoice.find().select('status total issuedAt paidAt').lean();
    const out = inv.filter((i) => i.status === 'ISSUED');
    const overdue = out.filter((i) => i.issuedAt && now - new Date(i.issuedAt) > 30 * D);
    return [
      card('Outstanding', inr(out.reduce((s, i) => s + i.total, 0)), `${out.length} issued invoices`, 'warning'),
      card('Overdue >30 d', overdue.length, inr(overdue.reduce((s, i) => s + i.total, 0)), overdue.length ? 'error' : 'success'),
      card('Drafts', inv.filter((i) => i.status === 'DRAFT').length, 'awaiting issue'),
      card('Collected MTD', inr(inv.filter((i) => i.paidAt && new Date(i.paidAt) >= new Date(now.getFullYear(), now.getMonth(), 1)).reduce((s, i) => s + i.total, 0)), '', 'success'),
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
    return [card('Berths', b), card('Lookup entries', l), card('Active tariffs', t), card('Checklist templates', c)];
  } },
  users: { perm: 'users.view', compute: async () => {
    const users = await User.find().select('active lastLoginAt').lean();
    return [
      card('Users', users.length, 'accounts'),
      card('Active', users.filter((u) => u.active).length, '', 'success'),
      card('Disabled', users.filter((u) => !u.active).length, ''),
      card('Signed in ≤7 d', users.filter((u) => u.lastLoginAt && Date.now() - new Date(u.lastLoginAt) < 7 * D).length, 'recent activity'),
    ];
  } },
};

exports.SCOPES = SCOPES;
exports.get = async (req, res) => {
  const scope = SCOPES[req.params.scope];
  if (!scope) throw new ApiError(404, `Unknown stats scope "${req.params.scope}"`);
  ok(res, { cards: await scope.compute(req) });
};
