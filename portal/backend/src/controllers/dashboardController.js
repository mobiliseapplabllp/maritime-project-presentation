const { Berth, PortCall, Invoice, Vessel, Inspection, AuditLog } = require('../models');
const { certStatus } = require('../domain/certStatus');
const { ok } = require('../utils/respond');

const HOUR = 3600 * 1000;
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d) => d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });

exports.summary = async (_req, res) => {
  const now = new Date();
  const start12 = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startYear = new Date(now.getFullYear(), 0, 1);

  const [berths, activeCalls, sailed12, invoices12, vessels, inspections, recentAudit] = await Promise.all([
    Berth.find().lean(),
    PortCall.find({ status: { $in: ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'] } })
      .populate('vessel', 'name type flag').populate('berth', 'code terminal').lean(),
    PortCall.find({ status: 'SAILED', atd: { $gte: start12 } })
      .select('atd ata atb cargoOps vessel').populate('vessel', 'name type').lean(),
    Invoice.find({ createdAt: { $gte: start12 }, status: { $in: ['ISSUED', 'PAID'] } })
      .select('total issuedAt createdAt status').lean(),
    Vessel.find({ status: 'ACTIVE' }).select('name imo certificates').lean(),
    Inspection.find({ $or: [{ status: { $ne: 'CLOSED' } }, { closedAt: { $gte: startYear } }] })
      .select('status detention findings closedAt').lean(),
    AuditLog.find().sort({ at: -1 }).limit(10).lean(),
  ]);

  // --- KPI cards ---
  const berthed = activeCalls.filter((c) => c.status === 'BERTHED');
  const anchored = activeCalls.filter((c) => c.status === 'AT_ANCHORAGE');
  const expected72 = activeCalls.filter((c) =>
    ['ANNOUNCED', 'CONFIRMED'].includes(c.status) &&
    new Date(c.eta) > now && new Date(c.eta) <= new Date(now.getTime() + 72 * HOUR));
  const operationalBerths = berths.filter((b) => b.status === 'OPERATIONAL');
  const occupiedBerthIds = new Set(berthed.map((c) => c.berth && String(c.berth._id)).filter(Boolean));

  const sailed30 = sailed12.filter((c) => c.atd >= new Date(now.getTime() - 30 * 24 * HOUR) && c.ata && c.atd);
  const avgTurnaround = sailed30.length
    ? sailed30.reduce((s, c) => s + (new Date(c.atd) - new Date(c.ata)), 0) / sailed30.length / HOUR
    : 0;

  const mtd = sailed12.filter((c) => c.atd >= startMonth);
  const cargoMTD = mtd.reduce((s, c) => s + (c.cargoOps || []).reduce((x, o) => x + (o.qtyMT || 0), 0), 0);
  const teuMTD = mtd.reduce((s, c) => s + (c.cargoOps || []).filter((o) => o.unit === 'TEU').reduce((x, o) => x + o.qty, 0), 0);
  const revenueMTD = invoices12.filter((i) => (i.issuedAt || i.createdAt) >= startMonth).reduce((s, i) => s + i.total, 0);

  const openDeficiencies = inspections.reduce((s, i) => s + (i.findings || []).filter((f) => f.status === 'OPEN').length, 0);
  const detentionsYTD = inspections.filter((i) => i.detention && i.closedAt && i.closedAt >= startYear).length;

  let expiringCerts = [];
  for (const v of vessels) {
    for (const c of v.certificates || []) {
      const st = certStatus(c.expiryDate, now);
      if (st !== 'VALID') expiringCerts.push({ vesselId: v._id, vessel: v.name, imo: v.imo, certType: c.certType, expiryDate: c.expiryDate, status: st });
    }
  }
  expiringCerts.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));

  // --- charts ---
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: monthLabel(d) });
  }
  const throughputByMonth = months.map((m) => ({ month: m.label, key: m.key, container: 0, dryBulk: 0, liquid: 0, other: 0, total: 0 }));
  const groupOf = { CONTAINERS: 'container', COAL: 'dryBulk', FERT: 'dryBulk', GRAIN: 'dryBulk', CRUDE: 'liquid', POL: 'liquid', EDIBLE: 'liquid' };
  const mixTotals = {};
  for (const c of sailed12) {
    const row = throughputByMonth.find((r) => r.key === monthKey(new Date(c.atd)));
    for (const o of c.cargoOps || []) {
      const grp = groupOf[o.cargoType] || 'other';
      const mt = o.qtyMT || 0;
      if (row) { row[grp] += mt; row.total += mt; }
      mixTotals[o.cargoType] = (mixTotals[o.cargoType] || 0) + mt;
    }
  }
  const revenueByMonth = months.map((m) => ({ month: m.label, key: m.key, revenue: 0 }));
  for (const i of invoices12) {
    const row = revenueByMonth.find((r) => r.key === monthKey(new Date(i.issuedAt || i.createdAt)));
    if (row) row.revenue += i.total;
  }

  const berthBoard = berths.map((b) => {
    const call = berthed.find((c) => c.berth && String(c.berth._id || c.berth) === String(b._id));
    return {
      _id: b._id, code: b.code, name: b.name, terminal: b.terminal, berthType: b.berthType, status: b.status, loaMax: b.loaMax, draftMax: b.draftMax,
      occupiedBy: call ? { callId: call._id, vcn: call.vcn, vessel: call.vessel && call.vessel.name, etd: call.etd, atb: call.atb } : null,
    };
  });

  const arrivals = activeCalls
    .filter((c) => ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE'].includes(c.status))
    .sort((a, b) => new Date(a.eta) - new Date(b.eta)).slice(0, 8)
    .map((c) => ({ _id: c._id, vcn: c.vcn, vessel: c.vessel && c.vessel.name, type: c.vessel && c.vessel.type, status: c.status, eta: c.eta, agentName: c.agentName }));

  ok(res, {
    kpis: {
      vesselsAtBerth: berthed.length,
      atAnchorage: anchored.length,
      expectedArrivals72h: expected72.length,
      berthOccupancyPct: operationalBerths.length ? Math.round((occupiedBerthIds.size / operationalBerths.length) * 100) : 0,
      avgTurnaroundHrs: Math.round(avgTurnaround * 10) / 10,
      cargoMTD, teuMTD, revenueMTD,
      openDeficiencies, detentionsYTD,
      certsExpiring: expiringCerts.filter((c) => c.status === 'EXPIRING').length,
      certsExpired: expiringCerts.filter((c) => c.status === 'EXPIRED').length,
    },
    throughputByMonth, revenueByMonth,
    cargoMix: Object.entries(mixTotals).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    berthBoard, arrivals,
    expiringCerts: expiringCerts.slice(0, 8),
    recentActivity: recentAudit.map((a) => ({ at: a.at, actor: a.actor && a.actor.name, action: a.action, entity: a.entity, label: a.entityLabel })),
  });
};
