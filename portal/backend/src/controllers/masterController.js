const { makeCrud } = require('./crudFactory');
const { ApiError, ok } = require('../utils/respond');
const { LOOKUP_CATEGORIES } = require('../config/constants');
const { Berth, Lookup, TariffItem, ChecklistTemplate, PortCall } = require('../models');
const { DAY, round1, monthWindow, overlapDays, availability, clampMonths } = require('../utils/history');

const berths = makeCrud(Berth, {
  entity: 'Berth', labelField: 'code',
  fields: ['code', 'name', 'terminal', 'berthType', 'loaMax', 'draftMax', 'status', 'remarks'],
  searchFields: ['code', 'name', 'terminal'], filterFields: ['terminal', 'berthType', 'status'],
  defaultSort: 'code',
  beforeDelete: async (doc) => {
    const inUse = await PortCall.countDocuments({ berth: doc._id, status: { $in: ['CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'] } });
    if (inUse) throw new ApiError(400, 'This berth has active or planned port calls — free it first');
  },
});

const lookups = makeCrud(Lookup, {
  entity: 'Lookup', labelField: 'label',
  fields: ['category', 'code', 'label', 'meta', 'active'],
  searchFields: ['code', 'label'], filterFields: ['category'],
  defaultSort: 'code',
  validate: (body, isCreate) => {
    if (isCreate && !LOOKUP_CATEGORIES.some((c) => c.key === body.category)) {
      throw new ApiError(400, `Unknown lookup category "${body.category}"`);
    }
  },
});

const tariffs = makeCrud(TariffItem, {
  entity: 'TariffItem', labelField: 'code',
  fields: ['code', 'name', 'category', 'unit', 'rate', 'currency', 'active'],
  searchFields: ['code', 'name'], filterFields: ['category'], defaultSort: 'code',
  validate: (body) => {
    if (body.rate !== undefined && (typeof body.rate !== 'number' || body.rate < 0)) {
      throw new ApiError(400, 'Rate must be a non-negative number');
    }
  },
});

const checklists = makeCrud(ChecklistTemplate, {
  entity: 'ChecklistTemplate', labelField: 'name',
  fields: ['name', 'inspectionType', 'description', 'items', 'active', 'version', 'passScorePct'],
  searchFields: ['name'], filterFields: ['inspectionType'], defaultSort: 'name',
  validate: (body) => {
    if (body.items !== undefined) {
      if (!Array.isArray(body.items) || body.items.some((i) => !i.text)) {
        throw new ApiError(400, 'Every checklist item needs text');
      }
      body.items = body.items.map((i, idx) => ({ seq: idx + 1, text: i.text, category: i.category || 'General' }));
    }
  },
});

/* ---------------- published rate history & berth downtime ---------------- */

/** One tariff head's published revision trail, plus the step series a chart needs. */
const tariffHistory = async (req, res) => {
  const doc = await TariffItem.findById(req.params.id).lean();
  if (!doc) throw new ApiError(404, 'TariffItem not found');
  const revisions = (doc.revisions || []).slice()
    .sort((a, b) => new Date(a.effectiveFrom) - new Date(b.effectiveFrom));

  const first = revisions[0];
  const baseRate = first ? (first.previousRate ?? first.rate) : doc.rate;
  const series = [{ label: 'Base', rate: baseRate, effectiveFrom: null, changePct: null, circular: '' }];
  for (const r of revisions) {
    const d = new Date(r.effectiveFrom);
    series.push({
      label: `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      rate: r.rate, effectiveFrom: r.effectiveFrom, changePct: r.changePct, circular: r.circular || '',
    });
  }
  if (revisions.length && doc.rate !== revisions[revisions.length - 1].rate) {
    series.push({ label: 'Current', rate: doc.rate, effectiveFrom: null, changePct: null, circular: '' });
  }

  const last = revisions[revisions.length - 1];
  const spanYears = first ? Math.max(1, (new Date(last.effectiveFrom) - new Date(first.effectiveFrom)) / (365.25 * 24 * 3600 * 1000) + 1) : 0;
  const totalChangePct = baseRate ? ((doc.rate - baseRate) / baseRate) * 100 : 0;
  ok(res, {
    item: {
      _id: doc._id, code: doc.code, name: doc.name, category: doc.category,
      unit: doc.unit, rate: doc.rate, currency: doc.currency, active: doc.active,
    },
    revisions,
    series,
    summary: {
      revisions: revisions.length,
      baseRate,
      currentRate: doc.rate,
      firstEffectiveFrom: first ? first.effectiveFrom : null,
      lastEffectiveFrom: last ? last.effectiveFrom : null,
      lastChangePct: last ? last.changePct : null,
      lastCircular: last ? last.circular : '',
      totalChangePct: round1(totalChangePct),
      avgChangePct: revisions.length ? round1(revisions.reduce((s, r) => s + (r.changePct || 0), 0) / revisions.length) : 0,
      cagrPct: baseRate > 0 && spanYears > 0 ? round1((((doc.rate / baseRate) ** (1 / spanYears)) - 1) * 100) : 0,
    },
  });
};

/** One berth's outage windows, with availability over the trailing window. */
const berthOutages = async (req, res) => {
  const doc = await Berth.findById(req.params.id).lean();
  if (!doc) throw new ApiError(404, 'Berth not found');
  const months = clampMonths(req.query.months, 12);
  const { bounds, from, to } = monthWindow(months);
  const outages = (doc.outages || []).slice().sort((a, b) => new Date(b.from) - new Date(a.from));

  const series = bounds.map((b) => ({
    month: b.key, label: b.label,
    days: round1(outages.reduce((s, o) => s + overlapDays(o.from, o.to, b.from, b.to), 0)),
    outages: outages.filter((o) => new Date(o.from) < b.to && new Date(o.to) > b.from).length,
  }));
  const byKind = new Map();
  for (const o of outages) {
    const k = o.kind || 'OTHER';
    const e = byKind.get(k) || { kind: k, outages: 0, days: 0 };
    e.outages += 1; e.days += o.days || 0; byKind.set(k, e);
  }
  const av = availability(outages, from, to);
  const inWindow = outages.filter((o) => new Date(o.from) < to && new Date(o.to) > from);
  const longest = outages.reduce((best, o) => (best && best.days >= (o.days || 0) ? best : o), null);

  ok(res, {
    berth: {
      _id: doc._id, code: doc.code, name: doc.name, terminal: doc.terminal,
      berthType: doc.berthType, loaMax: doc.loaMax, draftMax: doc.draftMax, status: doc.status,
    },
    summary: {
      window: { from, to, months },
      outages: inWindow.length, days: av.days, availabilityPct: av.availabilityPct,
      lifetime: {
        outages: outages.length,
        days: round1(outages.reduce((s, o) => s + (o.days || 0), 0)),
        firstFrom: outages.length ? outages[outages.length - 1].from : null,
        lastTo: outages.length ? outages[0].to : null,
      },
      byKind: [...byKind.values()].sort((a, b) => b.days - a.days).map((k) => ({ ...k, days: round1(k.days) })),
      series,
      longest,
    },
    outages,
  });
};

/** Estate-wide downtime — which berths, which causes, how availability trends. */
const berthDowntime = async (req, res) => {
  const months = clampMonths(req.query.months, 12);
  const { bounds, from, to } = monthWindow(months);
  const rows = await Berth.find().sort('code').lean();
  const spanDays = (to - from) / DAY;

  const series = bounds.map((b) => ({ month: b.key, label: b.label, days: 0, outages: 0 }));
  const byKind = new Map();
  const byTerminal = new Map();
  const berths = [];
  let lostDays = 0; let windowOutages = 0;

  for (const b of rows) {
    const outages = b.outages || [];
    const av = availability(outages, from, to);
    let count = 0;
    for (const o of outages) {
      const of2 = new Date(o.from); const ot = new Date(o.to);
      if (of2 < to && ot > from) {
        count += 1;
        const k = o.kind || 'OTHER';
        const e = byKind.get(k) || { kind: k, outages: 0, days: 0 };
        e.outages += 1;
        e.days += overlapDays(o.from, o.to, from, to);
        byKind.set(k, e);
      }
      bounds.forEach((bd, i) => {
        const d = overlapDays(o.from, o.to, bd.from, bd.to);
        if (d > 0) { series[i].days += d; series[i].outages += 1; }
      });
    }
    lostDays += av.days; windowOutages += count;
    const tb = byTerminal.get(b.terminal) || { terminal: b.terminal, berths: 0, outages: 0, days: 0 };
    tb.berths += 1; tb.outages += count; tb.days += av.days; byTerminal.set(b.terminal, tb);
    berths.push({
      _id: b._id, code: b.code, name: b.name, terminal: b.terminal, berthType: b.berthType, status: b.status,
      outages: count, days: av.days, availabilityPct: av.availabilityPct,
      lifetimeOutages: outages.length, lifetimeDays: round1(outages.reduce((s, o) => s + (o.days || 0), 0)),
    });
  }
  berths.sort((a, b) => b.days - a.days || a.code.localeCompare(b.code));

  ok(res, {
    window: { from, to, months },
    estate: {
      berths: rows.length,
      outages: windowOutages,
      days: round1(lostDays),
      berthDays: Math.round(rows.length * spanDays),
      availabilityPct: rows.length ? round1(Math.max(0, 100 - (lostDays / (rows.length * spanDays)) * 100)) : 100,
      underMaintenanceNow: rows.filter((b) => b.status === 'MAINTENANCE').length,
      worst: berths[0] || null,
    },
    byKind: [...byKind.values()].sort((a, b) => b.days - a.days)
      .map((k) => ({ ...k, days: round1(k.days), sharePct: lostDays ? round1((k.days / lostDays) * 100) : 0 })),
    byTerminal: [...byTerminal.values()].map((t) => ({
      ...t, days: round1(t.days),
      availabilityPct: t.berths ? round1(Math.max(0, 100 - (t.days / (t.berths * spanDays)) * 100)) : 100,
    })).sort((a, b) => b.days - a.days),
    series: series.map((s) => ({ ...s, days: round1(s.days) })),
    berths,
  });
};

module.exports = { berths, lookups, tariffs, checklists, tariffHistory, berthOutages, berthDowntime };
