/* Explainable, factor-weighted vessel risk engine — computed live from operational records.
 * Every score decomposes into named factors; weights are policy, stored in settings. */
const { Vessel, Inspection, PortCall, Setting } = require('../models');
const { DEFAULT_RISK_WEIGHTS } = require('../config/constants');
const { certStatus } = require('../domain/certStatus');
const { ApiError, ok } = require('../utils/respond');
const { audit } = require('../utils/audit');

const YEAR = 365 * 86400000;

async function getWeights() {
  const doc = await Setting.findOne({ key: 'riskWeights' }).lean();
  return { ...DEFAULT_RISK_WEIGHTS, ...((doc && doc.value) || {}) };
}

async function computeScores() {
  const now = new Date();
  const weights = await getWeights();
  const [vessels, inspections] = await Promise.all([
    Vessel.find({ status: 'ACTIVE' }).lean(),
    Inspection.find().select('vessel status result detention closedAt findings plannedAt').lean(),
  ]);

  const byVessel = new Map();
  for (const i of inspections) {
    const k = String(i.vessel);
    if (!byVessel.has(k)) byVessel.set(k, []);
    byVessel.get(k).push(i);
  }
  // agent fleet performance: detention/deficiency rate across the agent's vessels
  const agentStats = {};
  for (const v of vessels) {
    const ins = byVessel.get(String(v._id)) || [];
    const s = agentStats[v.agent] || (agentStats[v.agent] = { inspections: 0, bad: 0 });
    s.inspections += ins.length;
    s.bad += ins.filter((i) => i.detention || i.result === 'DEFICIENCIES').length;
  }

  const rows = vessels.map((v) => {
    const ins = byVessel.get(String(v._id)) || [];
    const factors = [];
    const add = (key, label, ratio, evidence) => {
      const weight = weights[key] || 0;
      const points = Math.round(Math.min(1, Math.max(0, ratio)) * weight * 10) / 10;
      factors.push({ key, label, points, max: weight, evidence });
      return points;
    };

    const age = now.getFullYear() - (v.built || now.getFullYear());
    add('age', 'Vessel age', age >= 25 ? 1 : age >= 15 ? 0.6 : age >= 10 ? 0.3 : 0.1, `${age} years (built ${v.built})`);

    const certs = (v.certificates || []).map((c) => certStatus(c.expiryDate, now));
    const expired = certs.filter((s) => s === 'EXPIRED').length;
    const expiring = certs.filter((s) => s === 'EXPIRING').length;
    add('certificates', 'Statutory certificates', expired ? 1 : expiring ? 0.5 : 0,
      expired ? `${expired} expired` : expiring ? `${expiring} expiring ≤30d` : 'all valid');

    const openDef = ins.reduce((s, i) => s + (i.findings || []).filter((f) => f.status === 'OPEN').length, 0);
    add('deficiencies', 'Open deficiencies', openDef / 3, `${openDef} open finding(s)`);

    const detained = ins.some((i) => i.detention && i.closedAt && now - new Date(i.closedAt) < 2 * YEAR);
    const defHistory = ins.some((i) => i.result === 'DEFICIENCIES' && i.closedAt && now - new Date(i.closedAt) < YEAR);
    add('detentions', 'Detention history', detained ? 1 : defHistory ? 0.4 : 0,
      detained ? 'detained within 24 months' : defHistory ? 'deficiencies within 12 months' : 'clean 24-month record');

    const lastClosed = ins.filter((i) => i.closedAt).sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt))[0];
    const gapMonths = lastClosed ? (now - new Date(lastClosed.closedAt)) / (30 * 86400000) : 24;
    add('inspectionGap', 'Time since inspection', gapMonths / 12,
      lastClosed ? `${Math.round(gapMonths)} month(s) since ${lastClosed.result || 'last inspection'}` : 'never inspected here');

    const ag = agentStats[v.agent] || { inspections: 0, bad: 0 };
    add('agentPerformance', 'Agent fleet record', ag.inspections ? ag.bad / ag.inspections : 0.3,
      ag.inspections ? `${ag.bad}/${ag.inspections} adverse across agent fleet` : 'no fleet history');

    const maxTotal = Object.values(weights).reduce((s, w) => s + w, 0);
    const raw = factors.reduce((s, f) => s + f.points, 0);
    const score = Math.round((raw / maxTotal) * 100);
    return {
      vesselId: v._id, name: v.name, imo: v.imo, type: v.type, flag: v.flag, built: v.built, agent: v.agent,
      score, band: score >= 60 ? 'HIGH' : score >= 35 ? 'MEDIUM' : 'LOW',
      factors: factors.sort((a, b) => b.points - a.points),
    };
  });
  rows.sort((a, b) => b.score - a.score);
  return { rows, weights };
}

exports.scores = async (_req, res) => {
  const { rows, weights } = await computeScores();
  ok(res, rows, { weights, computedAt: new Date().toISOString() });
};

exports.targeting = async (_req, res) => {
  const { rows } = await computeScores();
  const byVessel = Object.fromEntries(rows.map((r) => [String(r.vesselId), r]));
  const inbound = await PortCall.find({ status: { $in: ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED'] } })
    .populate('vessel', 'name imo type').populate('berth', 'code').lean();
  const list = inbound
    .map((c) => ({
      callId: c._id, vcn: c.vcn, status: c.status, eta: c.eta, berth: c.berth && c.berth.code,
      vessel: c.vessel && c.vessel.name, vesselId: c.vessel && c.vessel._id,
      risk: byVessel[String(c.vessel && c.vessel._id)] || null,
    }))
    .filter((x) => x.risk)
    .sort((a, b) => b.risk.score - a.risk.score);
  ok(res, list, { computedAt: new Date().toISOString() });
};

exports.getWeights = async (_req, res) => { ok(res, await getWeights()); };

exports.updateWeights = async (req, res) => {
  const body = req.body || {};
  const clean = {};
  for (const k of Object.keys(DEFAULT_RISK_WEIGHTS)) {
    if (body[k] !== undefined) {
      const v = Number(body[k]);
      if (Number.isNaN(v) || v < 0 || v > 50) throw new ApiError(400, `Weight ${k} must be between 0 and 50`);
      clean[k] = v;
    }
  }
  if (!Object.keys(clean).length) throw new ApiError(400, 'Nothing to update');
  const before = await getWeights();
  await Setting.findOneAndUpdate({ key: 'riskWeights' }, { $set: { value: { ...before, ...clean } } }, { upsert: true });
  const after = await getWeights();
  audit(req, { action: 'UPDATE', entity: 'Setting', entityId: 'riskWeights', entityLabel: 'Risk model weights', before, after });
  ok(res, after);
};
