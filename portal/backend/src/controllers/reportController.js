/* MIS reporting — date-ranged management aggregates across all modules. */
const { PortCall, Invoice, Inspection, Vessel, Seafarer, License, Lookup, Berth } = require('../models');
const { certStatus } = require('../domain/certStatus');
const { ApiError, ok } = require('../utils/respond');

const H = 3600 * 1000;
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (d) => d.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
const GROUP_OF = { CONTAINERS: 'container', COAL: 'dryBulk', FERT: 'dryBulk', GRAIN: 'dryBulk', CRUDE: 'liquid', POL: 'liquid', EDIBLE: 'liquid' };

exports.mis = async (req, res) => {
  const to = req.query.to ? new Date(`${req.query.to}T23:59:59`) : new Date();
  let from = req.query.from ? new Date(req.query.from) : new Date(to.getFullYear(), to.getMonth() - 11, 1);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new ApiError(400, 'Provide a valid from/to date range');
  }
  // the month scaffold caps at 60 columns; anchor the cap to `to` so an over-long
  // range keeps its newest months, and clamp the query window so KPIs still
  // reconcile with the charts instead of silently covering more than they show
  if ((to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) >= 60) {
    from = new Date(to.getFullYear(), to.getMonth() - 59, 1);
  }

  const [sailed, invoices, inspections, vessels, seafarers, licenses, berths, defCodes] = await Promise.all([
    PortCall.find({ status: 'SAILED', atd: { $gte: from, $lte: to } })
      .select('atd ata atb vessel berth cargoOps agentName').populate('vessel', 'name type').populate('berth', 'code terminal').lean(),
    Invoice.find({ $or: [{ issuedAt: { $gte: from, $lte: to } }, { paidAt: { $gte: from, $lte: to } }] })
      .select('status total lines issuedAt paidAt').lean(),
    Inspection.find({ closedAt: { $gte: from, $lte: to } }).select('type result detention findings').lean(),
    Vessel.find({ status: 'ACTIVE' }).select('certificates').lean(),
    Seafarer.find().select('certificates').lean(),
    License.find().select('status expiryDate entityType').lean(),
    Berth.find().lean(),
    Lookup.find({ category: 'deficiencyCode' }).lean(),
  ]);

  // month scaffold
  const months = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  while (cur <= to && months.length < 60) {
    months.push({ key: monthKey(cur), month: monthLabel(cur) });
    cur.setMonth(cur.getMonth() + 1);
  }
  const byMonth = months.map((m) => ({ ...m, container: 0, dryBulk: 0, liquid: 0, other: 0, total: 0, teu: 0, calls: 0 }));
  const commodity = {};
  const byTerminal = {};
  const byVesselType = {};
  let turnSum = 0, turnN = 0, waitSum = 0;
  for (const c of sailed) {
    const row = byMonth.find((r) => r.key === monthKey(new Date(c.atd)));
    if (row) row.calls += 1;
    if (c.ata && c.atd) { turnSum += (new Date(c.atd) - new Date(c.ata)) / H; turnN += 1; }
    if (c.ata && c.atb) waitSum += (new Date(c.atb) - new Date(c.ata)) / H;
    const term = (c.berth && c.berth.terminal) || 'Unassigned';
    byTerminal[term] = byTerminal[term] || { terminal: term, calls: 0, mt: 0 };
    byTerminal[term].calls += 1;
    const vt = (c.vessel && c.vessel.type) || 'OTHER';
    byVesselType[vt] = (byVesselType[vt] || 0) + 1;
    for (const o of c.cargoOps || []) {
      const mt = o.qtyMT || 0;
      const grp = GROUP_OF[o.cargoType] || 'other';
      if (row) { row[grp] += mt; row.total += mt; if (o.unit === 'TEU') row.teu += o.qty; }
      commodity[o.cargoType] = (commodity[o.cargoType] || 0) + mt;
      byTerminal[term].mt += mt;
    }
  }

  const revMonth = months.map((m) => ({ ...m, billed: 0, collected: 0 }));
  const byHead = {};
  let billed = 0, collected = 0;
  for (const i of invoices) {
    if (i.issuedAt && i.issuedAt >= from && i.issuedAt <= to && ['ISSUED', 'PAID'].includes(i.status)) {
      billed += i.total;
      const r = revMonth.find((x) => x.key === monthKey(new Date(i.issuedAt)));
      if (r) r.billed += i.total;
      for (const l of i.lines || []) {
        byHead[l.code] = byHead[l.code] || { code: l.code, name: l.description.split(' — ')[0], amount: 0 };
        byHead[l.code].amount += l.amount;
      }
    }
    if (i.paidAt && i.paidAt >= from && i.paidAt <= to) {
      collected += i.total;
      const r = revMonth.find((x) => x.key === monthKey(new Date(i.paidAt)));
      if (r) r.collected += i.total;
    }
  }
  const outstanding = (await Invoice.find({ status: 'ISSUED' }).select('total').lean()).reduce((s, i) => s + i.total, 0);

  const insByType = {}, insByResult = {}, defCount = {};
  let detentions = 0;
  for (const i of inspections) {
    insByType[i.type] = (insByType[i.type] || 0) + 1;
    if (i.result) insByResult[i.result] = (insByResult[i.result] || 0) + 1;
    if (i.detention) detentions += 1;
    for (const f of i.findings || []) defCount[f.deficiencyCode] = (defCount[f.deficiencyCode] || 0) + 1;
  }
  const defLabel = Object.fromEntries(defCodes.map((d) => [d.code, d.label]));

  const vesselCertStates = vessels.flatMap((v) => (v.certificates || []).map((c) => certStatus(c.expiryDate)));
  const seafarerCertStates = seafarers.flatMap((v) => (v.certificates || []).map((c) => certStatus(c.expiryDate)));

  ok(res, {
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
      operationalBerths: berths.filter((b) => b.status === 'OPERATIONAL').length,
    },
    revenue: {
      byMonth: revMonth.map(({ key, ...r }) => r),
      byHead: Object.values(byHead).sort((a, b) => b.amount - a.amount),
      billed, collected, outstanding,
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
      expiring90: licenses.filter((l) => l.status === 'ISSUED' && l.expiryDate && new Date(l.expiryDate) < new Date(Date.now() + 90 * 24 * H)).length,
    },
  });
};
