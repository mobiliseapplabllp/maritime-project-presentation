/* Harbour operations depth — the 2D quay twin, the day-wise vessel schedule
 * and the marine resource (tugs / pilot launches / pilots) board. */
const { Berth, PortCall, Resource } = require('../models');
const { ApiError, ok } = require('../utils/respond');
const { audit } = require('../utils/audit');
const { round1, monthKey, monthWindow, availability, clampMonths } = require('../utils/history');

const D = 24 * 3600 * 1000;

// Everything the quay-view twin needs in one call.
exports.twin = async (req, res) => {
  const [berths, active] = await Promise.all([
    Berth.find().sort('code').lean(),
    PortCall.find({ status: { $in: ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'] } })
      .populate('vessel', 'name imo type loa dwt').populate('berth', 'code').lean(),
  ]);
  const byBerth = new Map(active.filter((c) => c.status === 'BERTHED' && c.berth)
    .map((c) => [String(c.berth.code), c]));
  ok(res, {
    berths: berths.map((b) => {
      const c = byBerth.get(b.code);
      return {
        _id: b._id, code: b.code, name: b.name, terminal: b.terminal, berthType: b.berthType,
        loaMax: b.loaMax, draftMax: b.draftMax, status: b.status,
        occupiedBy: c ? {
          callId: c._id, vcn: c.vcn, vesselId: c.vessel?._id, vessel: c.vessel?.name,
          type: c.vessel?.type, loa: c.vessel?.loa, atb: c.atb, etd: c.etd,
          cargo: (c.cargoOps || []).map((o) => `${o.operation.toLowerCase()} ${new Intl.NumberFormat('en-IN').format(o.qty)} ${o.unit} ${o.cargoType}`).join('; '),
        } : null,
      };
    }),
    anchorage: active.filter((c) => c.status === 'AT_ANCHORAGE').map((c) => ({
      callId: c._id, vcn: c.vcn, vesselId: c.vessel?._id, vessel: c.vessel?.name,
      type: c.vessel?.type, loa: c.vessel?.loa, since: c.ata, etb: c.etb,
    })),
    inbound: active.filter((c) => ['ANNOUNCED', 'CONFIRMED'].includes(c.status)).map((c) => ({
      callId: c._id, vcn: c.vcn, vesselId: c.vessel?._id, vessel: c.vessel?.name,
      type: c.vessel?.type, loa: c.vessel?.loa, eta: c.eta, status: c.status,
    })).sort((a, b) => new Date(a.eta) - new Date(b.eta)),
  });
};

// Day-wise arrivals / berthings / sailings board around "today".
exports.schedule = async (req, res) => {
  const days = Math.min(14, Math.max(1, parseInt(req.query.days, 10) || 5));
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const from = new Date(start.getTime() - 1 * D);
  const to = new Date(start.getTime() + days * D);
  const calls = await PortCall.find({
    $or: [
      { eta: { $gte: from, $lte: to } },
      { etd: { $gte: from, $lte: to } },
      { atd: { $gte: from, $lte: to } },
      { status: 'BERTHED' },
    ],
    status: { $ne: 'CANCELLED' },
  }).populate('vessel', 'name type loa').populate('berth', 'code terminal').lean();

  const events = [];
  for (const c of calls) {
    const base = { callId: c._id, vcn: c.vcn, vesselId: c.vessel?._id, vessel: c.vessel?.name,
      type: c.vessel?.type, berth: c.berth?.code || '—', agent: c.agentName, status: c.status };
    if (['ANNOUNCED', 'CONFIRMED'].includes(c.status) && c.eta) events.push({ ...base, kind: 'ARRIVAL', at: c.eta, planned: true });
    if (c.status === 'AT_ANCHORAGE' && c.etb) events.push({ ...base, kind: 'BERTHING', at: c.etb, planned: true });
    if (c.status === 'BERTHED' && c.etd) events.push({ ...base, kind: 'SAILING', at: c.etd, planned: true });
    if (c.status === 'SAILED' && c.atd && c.atd >= from && c.atd <= to) events.push({ ...base, kind: 'SAILED', at: c.atd, planned: false });
  }
  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  ok(res, { from, to, events });
};

/* Marine resources board. Each craft carries its whole service record (a tug
 * runs to ~700 jobs), so the jobs array never leaves the server — the board
 * gets a digest and /ops/resources/:id/history pages the detail. */
exports.resources = async (req, res) => {
  const rows = await Resource.find().sort('type code').lean();
  const months = clampMonths(req.query.months, 12);
  const { from, to } = monthWindow(months);
  const since30 = new Date(Date.now() - 30 * D);
  const data = rows.map(({ jobs = [], ...r }) => {
    const av = availability(r.outages, from, to);
    let hours = 0; let last = null; let winJobs = 0; let winHours = 0; let jobs30d = 0;
    for (const j of jobs) {
      const at = new Date(j.at);
      hours += j.hours || 0;
      if (!last || at > last) last = at;
      if (at >= from && at < to) { winJobs += 1; winHours += j.hours || 0; }
      if (at >= since30) jobs30d += 1;
    }
    return {
      ...r,
      service: {
        jobs: jobs.length, hours: round1(hours), windowJobs: winJobs, windowHours: round1(winHours),
        jobs30d, lastJobAt: last, outages: (r.outages || []).length,
        outageDays: av.days, availabilityPct: av.availabilityPct,
      },
    };
  });
  ok(res, data, { window: { from, to, months } });
};

/* Fleet-level utilisation — jobs and assist hours per month across every craft,
 * the busiest units and the share of time the fleet was available. */
exports.resourceUtilisation = async (req, res) => {
  const months = clampMonths(req.query.months, 12);
  const { bounds, from, to } = monthWindow(months);
  const rows = await Resource.find().sort('type code').lean();

  const buckets = new Map(bounds.map((b) => [b.key, { month: b.key, label: b.label, jobs: 0, hours: 0 }]));
  const kinds = new Map();
  const types = new Map();
  const craft = [];
  let allJobs = 0; let allHours = 0; let winJobs = 0; let winHours = 0; let lostDays = 0;

  for (const r of rows) {
    const jobs = r.jobs || [];
    const av = availability(r.outages, from, to);
    let cJobs = 0; let cHours = 0; let cAllHours = 0; let last = null;
    for (const j of jobs) {
      const at = new Date(j.at);
      const h = j.hours || 0;
      cAllHours += h;
      if (!last || at > last) last = at;
      if (at >= from && at < to) {
        cJobs += 1; cHours += h;
        const b = buckets.get(monthKey(at));
        if (b) { b.jobs += 1; b.hours += h; }
        const k = j.kind || 'OTHER';
        const kb = kinds.get(k) || { kind: k, jobs: 0, hours: 0 };
        kb.jobs += 1; kb.hours += h; kinds.set(k, kb);
      }
    }
    const tb = types.get(r.type) || { type: r.type, craft: 0, jobs: 0, hours: 0 };
    tb.craft += 1; tb.jobs += cJobs; tb.hours += cHours; types.set(r.type, tb);
    allJobs += jobs.length; allHours += cAllHours; winJobs += cJobs; winHours += cHours; lostDays += av.days;
    craft.push({
      _id: r._id, code: r.code, name: r.name, type: r.type, status: r.status,
      jobs: cJobs, hours: round1(cHours), jobsAllTime: jobs.length, hoursAllTime: round1(cAllHours),
      outageDays: av.days, availabilityPct: av.availabilityPct, lastJobAt: last,
    });
  }

  const spanDays = (to - from) / D;
  craft.sort((a, b) => b.jobs - a.jobs || a.code.localeCompare(b.code));
  const series = [...buckets.values()].map((b) => ({ ...b, hours: round1(b.hours) }));
  ok(res, {
    window: { from, to, months },
    totals: {
      craft: rows.length, jobs: winJobs, hours: round1(winHours),
      jobsAllTime: allJobs, hoursAllTime: round1(allHours),
      avgJobsPerMonth: round1(winJobs / months), avgHoursPerJob: winJobs ? round1(winHours / winJobs) : 0,
      outageDays: round1(lostDays),
      availabilityPct: rows.length ? round1(Math.max(0, 100 - (lostDays / (rows.length * spanDays)) * 100)) : 100,
    },
    series,
    byKind: [...kinds.values()].sort((a, b) => b.jobs - a.jobs).map((k) => ({ ...k, hours: round1(k.hours) })),
    byType: [...types.values()].map((t) => ({ ...t, hours: round1(t.hours) })),
    craft,
  });
};

/* One craft's service record — paged jobs plus the utilisation reading. */
exports.resourceHistory = async (req, res) => {
  const doc = await Resource.findById(req.params.id).lean();
  if (!doc) throw new ApiError(404, 'Resource not found');
  const months = clampMonths(req.query.months, 12);
  const { bounds, from, to } = monthWindow(months);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));

  const all = (doc.jobs || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at));
  const kinds = [...new Set(all.map((j) => j.kind).filter(Boolean))].sort();
  const rows = req.query.kind ? all.filter((j) => j.kind === req.query.kind) : all;

  const buckets = new Map(bounds.map((b) => [b.key, { month: b.key, label: b.label, jobs: 0, hours: 0 }]));
  const byKind = new Map();
  let hours = 0; let winJobs = 0; let winHours = 0;
  for (const j of all) {
    const at = new Date(j.at);
    const h = j.hours || 0;
    hours += h;
    const k = j.kind || 'OTHER';
    const kb = byKind.get(k) || { kind: k, jobs: 0, hours: 0 };
    kb.jobs += 1; kb.hours += h; byKind.set(k, kb);
    if (at >= from && at < to) {
      winJobs += 1; winHours += h;
      const b = buckets.get(monthKey(at));
      if (b) { b.jobs += 1; b.hours += h; }
    }
  }
  const series = [...buckets.values()].map((b) => ({ ...b, hours: round1(b.hours) }));
  const busiest = series.reduce((best, b) => (best && best.jobs >= b.jobs ? best : b), null);
  const av = availability(doc.outages, from, to);
  const outages = (doc.outages || []).slice().sort((a, b) => new Date(b.from) - new Date(a.from));

  ok(res, {
    resource: {
      _id: doc._id, code: doc.code, name: doc.name, type: doc.type, spec: doc.spec,
      status: doc.status, master: doc.master, contact: doc.contact, remarks: doc.remarks,
    },
    summary: {
      window: { from, to, months },
      jobs: winJobs, hours: round1(winHours),
      avgHours: winJobs ? round1(winHours / winJobs) : 0,
      avgJobsPerMonth: round1(winJobs / months),
      outageDays: av.days, availabilityPct: av.availabilityPct,
      busiestMonth: busiest && busiest.jobs ? busiest : null,
      lifetime: {
        jobs: all.length, hours: round1(hours),
        firstJobAt: all.length ? all[all.length - 1].at : null,
        lastJobAt: all.length ? all[0].at : null,
        outages: outages.length,
        outageDays: round1(outages.reduce((s, o) => s + (o.days || 0), 0)),
      },
      series,
      byKind: [...byKind.values()].sort((a, b) => b.jobs - a.jobs).map((k) => ({ ...k, hours: round1(k.hours) })),
    },
    outages,
    jobs: rows.slice((page - 1) * limit, page * limit),
  }, { total: rows.length, page, limit, kinds });
};

exports.setResourceStatus = async (req, res) => {
  const doc = await Resource.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Resource not found');
  const { status, currentTask } = req.body || {};
  if (status && !['AVAILABLE', 'TASKED', 'MAINTENANCE', 'OFF_DUTY'].includes(status)) {
    throw new ApiError(400, 'Invalid resource status');
  }
  const before = doc.toObject();
  if (status) doc.status = status;
  doc.currentTask = status === 'TASKED' ? (currentTask || doc.currentTask) : '';
  await doc.save();
  audit(req, { action: 'UPDATE', entity: 'Resource', entityId: doc._id, entityLabel: `${doc.code} — ${doc.name}`, before, after: doc });
  ok(res, doc);
};

/* ---------------- v8: SOF, berth window planner, PDA ---------------- */
const settings = require('../config/settingsCache');
const { TariffItem, Invoice } = require('../models');
const { buildInvoiceLines, computeTotals, round2 } = require('../domain/invoiceMath');
const { GST_RATE } = require('../config/constants');

// Statement of Facts — the chronological port-stay record, compiled from
// what the call already carries: status history, cargo operations, services.
exports.sof = async (req, res) => {
  const call = await PortCall.findById(req.params.id).populate('vessel').populate('berth', 'code name terminal').lean();
  if (!call) throw new ApiError(404, 'Port call not found');
  const ev = [];
  const push = (at, event, detail) => { if (at) ev.push({ at, event, detail: detail || '' }); };
  push(call.createdAt, 'Vessel call announced', `VCN ${call.vcn} issued to ${call.agentName || call.agentCode || 'agent'}`);
  for (const h of call.statusHistory || []) {
    push(h.at, `Status: ${String(h.from || '').replace(/_/g, ' ')} → ${String(h.to || '').replace(/_/g, ' ')}`, h.note);
  }
  push(call.ata, 'Arrived pilot station / anchorage', call.draftArrival ? `Arrival draft ${call.draftArrival} m` : '');
  push(call.atb, `All fast alongside ${call.berth ? call.berth.code : ''}`, call.berth ? call.berth.terminal : '');
  for (const c of call.cargoOps || []) {
    const what = `${c.operation === 'LOAD' ? 'Loading' : 'Discharge'} ${c.cargoType} — ${Number(c.qty).toLocaleString('en-IN')} ${c.unit}`;
    push(c.startedAt, `${what} commenced`, c.gangs ? `${c.gangs} gangs` : '');
    push(c.completedAt, `${what} completed`, c.remarks);
  }
  for (const s of call.services || []) push(s.at, `Service rendered: ${s.type.replace(/_/g, ' ')}`, s.description || s.remarks);
  push(call.atd, 'Vessel sailed', call.draftDeparture ? `Sailing draft ${call.draftDeparture} m · for ${call.nextPort || 'sea'}` : (call.nextPort ? `For ${call.nextPort}` : ''));
  ev.sort((a, b) => new Date(a.at) - new Date(b.at));
  ok(res, { call, events: ev });
};

// Berth window planner — every berth as a lane, calls as planned/actual blocks,
// overlap conflicts computed server-side. Window defaults to -1d .. +scheduleWindowDays.
exports.berthPlan = async (req, res) => {
  const winDays = Number(req.query.days) || (settings.isReady() && settings.moduleGet('ops').scheduleWindowDays) || 5;
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - D);
  const to = new Date(from.getTime() + (winDays + 1) * D);
  const [berths, calls, inbound] = await Promise.all([
    Berth.find().sort('terminal code').lean(),
    PortCall.find({
      berth: { $ne: null },
      status: { $in: ['CONFIRMED', 'AT_ANCHORAGE', 'BERTHED', 'SAILED'] },
      $or: [
        { atb: { $lt: to }, $and: [{ $or: [{ atd: null }, { atd: { $gt: from } }] }] },
        { atb: null, etb: { $lt: to }, etd: { $gt: from } },
      ],
    }).populate('vessel', 'name loa type').lean(),
    PortCall.find({
      status: { $in: ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE'] },
      $or: [{ berth: null }, { etb: null }],
      eta: { $lt: to },
    }).sort('eta').limit(20).populate('vessel', 'name loa type').lean(),
  ]);
  const blocks = calls.map((c) => ({
    id: c._id, vcn: c.vcn, berth: String(c.berth), status: c.status,
    vessel: c.vessel ? { name: c.vessel.name, loa: c.vessel.loa, type: c.vessel.type } : null,
    start: c.atb || c.etb, end: c.atd || c.etd || (c.atb ? null : null), actual: !!c.atb,
  }));
  // conflicts: overlapping planned/actual windows on the same berth
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
  ok(res, {
    window: { from, to, days: winDays },
    berths: berths.map((b) => ({ _id: b._id, code: b.code, name: b.name, terminal: b.terminal, berthType: b.berthType, status: b.status, loaMax: b.loaMax, draftMax: b.draftMax })),
    blocks, conflicts,
    unallocated: inbound.map((c) => ({ id: c._id, vcn: c.vcn, eta: c.eta, status: c.status, vessel: c.vessel ? { name: c.vessel.name, loa: c.vessel.loa, type: c.vessel.type } : null })),
  });
};

// Proforma Disbursement Account — pre-arrival cost estimate from tariffs,
// persisted on the call so the final invoice can be compared against it.
exports.generatePda = async (req, res) => {
  const call = await PortCall.findById(req.params.id).populate('vessel');
  if (!call) throw new ApiError(404, 'Port call not found');
  if (!call.vessel || !call.vessel.grt) throw new ApiError(400, 'The vessel needs a GRT before an estimate can be made');
  const tariffDocs = await TariffItem.find({ active: true }).lean();
  const tariffs = Object.fromEntries(tariffDocs.map((t) => [t.code, t]));
  const ops = settings.isReady() ? settings.moduleGet('ops') : {};
  const grt = call.vessel.grt;
  const loa = call.vessel.loa || 0;
  const tugs = loa >= 250 ? (ops.defaultTugsOver250m || 3) : (ops.defaultTugsUnder250m || 2);
  const plannedDays = call.etb && call.etd
    ? Math.max(1, Math.ceil((new Date(call.etd) - new Date(call.etb)) / D))
    : 2;

  // Start from whatever is already known (planned cargo + booked services)…
  const lines = buildInvoiceLines(call, tariffs);
  const have = new Set(lines.map((l) => l.code));
  const add = (code, qty, suffix) => {
    const t = tariffs[code];
    if (!t || !qty || have.has(code)) return;
    lines.push({ code: t.code, description: suffix ? `${t.name} — ${suffix}` : t.name, unit: t.unit, qty, rate: t.rate, amount: round2(qty * t.rate) });
  };
  // …then the standard pre-arrival heads every PDA carries.
  add('PIL', 2, 'inward + outward');
  add('TUG', tugs * 2, `${tugs} tugs × 2 movements`);
  add('BH', grt * plannedDays, `${plannedDays} days alongside (planned)`);
  if (!lines.length) throw new ApiError(400, 'No tariff heads matched — check the tariff master');

  const gstRate = Number(settings.get('billing', {}).gstRate) || GST_RATE;
  const totals = computeTotals(lines, gstRate);
  call.pda = {
    number: `PDA/${call.vcn}`,
    lines: totals.lines, subtotal: totals.subtotal, gstRate, gstAmount: totals.gstAmount, total: totals.total,
    basis: { grt, plannedDays, tugs },
    generatedAt: new Date(), generatedBy: req.user ? req.user.name : 'system',
  };
  await call.save();
  audit(req, { action: 'CREATE', entity: 'PortCall', entityId: call._id, entityLabel: `PDA for ${call.vcn}`, after: { pda: call.pda } });
  ok(res, call.pda);
};

// PDA vs final invoice — the variance every agent reconciles.
exports.pdaVariance = async (req, res) => {
  const call = await PortCall.findById(req.params.id).populate('vessel', 'name imo grt loa').lean();
  if (!call) throw new ApiError(404, 'Port call not found');
  if (!call.pda || !call.pda.generatedAt) throw new ApiError(404, 'No PDA has been generated for this call');
  const invoice = await Invoice.findOne({ portCall: call._id, status: { $in: ['ISSUED', 'PAID'] } }).lean();
  let variance = null;
  if (invoice) {
    const codes = new Set([...call.pda.lines.map((l) => l.code), ...invoice.lines.map((l) => l.code)]);
    variance = {
      lines: [...codes].map((code) => {
        const est = call.pda.lines.filter((l) => l.code === code).reduce((s, l) => s + l.amount, 0);
        const act = invoice.lines.filter((l) => l.code === code).reduce((s, l) => s + l.amount, 0);
        return { code, estimated: round2(est), actual: round2(act), delta: round2(act - est) };
      }),
      estimatedTotal: call.pda.total, actualTotal: invoice.total, delta: round2(invoice.total - call.pda.total),
      invoiceNumber: invoice.number,
    };
  }
  ok(res, { call: { vcn: call.vcn, vessel: call.vessel, agentName: call.agentName, eta: call.eta }, pda: call.pda, variance });
};
