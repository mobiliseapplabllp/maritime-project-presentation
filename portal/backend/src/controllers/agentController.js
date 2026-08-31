/* A3 — agent autonomy configuration, the AI decision register, and the human
 * review queue.
 *
 * The governance posture the RFP asks for is not "the AI is careful"; it is that
 * the authority can see every decision, change how much latitude each agent has
 * without calling the vendor, overturn anything, and suspend an agent within
 * four hours. All four are here. */
const { AgentConfig, AiDecision, Notification } = require('../models');
const { ApiError, ok, created } = require('../utils/respond');
const { parseQuery } = require('../utils/paginate');
const { audit } = require('../utils/audit');

const LEVELS = ['SUPERVISED', 'ASSISTED', 'AUTONOMOUS'];

/* ------------------------------------------------------------------ config --- */

// Mongoose virtuals do not survive .lean(), so derive it where it is read.
const withAgreement = (a) => ({
  ...a,
  agreementRate: a.stats && a.stats.decisions
    ? Math.round(((a.stats.decisions - (a.stats.overridden || 0)) / a.stats.decisions) * 1000) / 10
    : null,
});

exports.list = async (_req, res) => {
  const rows = (await AgentConfig.find().sort({ domain: 1, name: 1 }).lean()).map(withAgreement);
  const active = rows.filter((r) => r.enabled && !r.suspended);
  ok(res, rows, {
    total: rows.length,
    active: active.length,
    suspended: rows.filter((r) => r.suspended).length,
    autonomous: rows.filter((r) => r.autonomyLevel === 'AUTONOMOUS' && !r.suspended).length,
  });
};

exports.get = async (req, res) => {
  const found = await AgentConfig.findOne({ agentId: req.params.agentId }).lean();
  if (!found) throw new ApiError(404, 'Agent not found');
  const doc = withAgreement(found);
  const recent = await AiDecision.find({ agentId: req.params.agentId }).sort({ at: -1 }).limit(20).lean();
  ok(res, { ...doc, recentDecisions: recent });
};

/** Change autonomy, threshold or enablement. Every change is recorded. */
exports.configure = async (req, res) => {
  const doc = await AgentConfig.findOne({ agentId: req.params.agentId });
  if (!doc) throw new ApiError(404, 'Agent not found');
  const b = req.body || {};
  const { reason } = b;
  const changes = [];
  const now = new Date();

  if (b.autonomyLevel !== undefined && b.autonomyLevel !== doc.autonomyLevel) {
    if (!LEVELS.includes(b.autonomyLevel)) throw new ApiError(400, `Autonomy must be one of ${LEVELS.join(', ')}`);
    // raising autonomy is a governance decision and must be justified
    if (LEVELS.indexOf(b.autonomyLevel) > LEVELS.indexOf(doc.autonomyLevel) && !reason) {
      throw new ApiError(400, 'Raising an agent\'s autonomy requires a written reason');
    }
    changes.push({ field: 'autonomyLevel', from: doc.autonomyLevel, to: b.autonomyLevel, at: now, by: req.user.name, reason: reason || '' });
    doc.autonomyLevel = b.autonomyLevel;
  }
  if (b.confidenceThreshold !== undefined && b.confidenceThreshold !== doc.confidenceThreshold) {
    const t = Number(b.confidenceThreshold);
    if (!(t >= 0 && t <= 1)) throw new ApiError(400, 'Confidence threshold must be between 0 and 1');
    changes.push({ field: 'confidenceThreshold', from: String(doc.confidenceThreshold), to: String(t), at: now, by: req.user.name, reason: reason || '' });
    doc.confidenceThreshold = t;
  }
  if (b.enabled !== undefined && b.enabled !== doc.enabled) {
    changes.push({ field: 'enabled', from: String(doc.enabled), to: String(b.enabled), at: now, by: req.user.name, reason: reason || '' });
    doc.enabled = b.enabled;
  }
  if (b.maxActionsPerHour !== undefined) doc.maxActionsPerHour = Number(b.maxActionsPerHour);
  if (b.escalateTo !== undefined) doc.escalateTo = b.escalateTo;

  if (!changes.length && b.maxActionsPerHour === undefined && b.escalateTo === undefined) {
    throw new ApiError(400, 'Nothing to change');
  }
  doc.changes.push(...changes);
  await doc.save();
  audit(req, {
    action: 'AGENT_CONFIG', entity: 'AgentConfig', entityId: doc._id,
    entityLabel: `${doc.name}: ${changes.map((c) => `${c.field} ${c.from} → ${c.to}`).join(', ') || 'limits updated'}`,
  });
  ok(res, doc);
};

/** §8.4 — suspend an agent producing biased or inaccurate output. */
exports.suspend = async (req, res) => {
  const doc = await AgentConfig.findOne({ agentId: req.params.agentId });
  if (!doc) throw new ApiError(404, 'Agent not found');
  const { reason, suspended = true } = req.body || {};
  if (suspended && !reason) throw new ApiError(400, 'A reason is required to suspend an agent');
  const now = new Date();
  doc.changes.push({
    field: 'suspended', from: String(doc.suspended), to: String(suspended),
    at: now, by: req.user.name, reason: reason || 'Reinstated',
  });
  doc.suspended = !!suspended;
  doc.suspendedReason = suspended ? reason : '';
  doc.suspendedBy = suspended ? req.user.name : '';
  doc.suspendedAt = suspended ? now : undefined;
  await doc.save();
  Notification.create({
    title: `AI agent ${suspended ? 'suspended' : 'reinstated'} — ${doc.name}`,
    body: reason || 'Reinstated after investigation.',
    severity: suspended ? 'warning' : 'success', link: '/admin/agents', audiencePerm: 'agents.view',
  }).catch(() => {});
  audit(req, { action: suspended ? 'AGENT_SUSPEND' : 'AGENT_REINSTATE', entity: 'AgentConfig', entityId: doc._id, entityLabel: `${doc.name} — ${reason || ''}` });
  ok(res, doc);
};

/* --------------------------------------------------------------- decisions --- */

/**
 * Record a decision and apply the autonomy policy in force.
 * Returns the recorded decision with its disposition, so the caller knows
 * whether it may act or must wait for review.
 */
exports.record = async function record({ agentId, action, subject = {}, inputs, output,
  explanation = '', factors = [], confidence = 0, modelId = '', modelVersion = '', latencyMs = 0 }) {
  const cfg = await AgentConfig.findOne({ agentId });
  const level = cfg ? cfg.autonomyLevel : 'SUPERVISED';
  const threshold = cfg ? cfg.confidenceThreshold : 1;

  let disposition = 'AWAITING_REVIEW';
  let escalationReason = '';
  if (cfg && cfg.suspended) {
    disposition = 'ESCALATED';
    escalationReason = `Agent suspended: ${cfg.suspendedReason}`;
  } else if (level === 'AUTONOMOUS') {
    disposition = 'AUTO_APPLIED';
  } else if (level === 'ASSISTED') {
    if (confidence >= threshold) disposition = 'AUTO_APPLIED';
    else { disposition = 'ESCALATED'; escalationReason = `Confidence ${confidence.toFixed(2)} below threshold ${threshold}`; }
  } else {
    disposition = 'AWAITING_REVIEW';
    escalationReason = 'Agent is under supervision — every decision is reviewed';
  }

  const doc = await AiDecision.create({
    agentId, agentName: cfg ? cfg.name : agentId, action,
    subjectType: subject.type || '', subjectId: subject.id || '', subjectLabel: subject.label || '',
    inputs, output, explanation, factors, confidence,
    autonomyLevel: level, threshold, disposition, escalationReason,
    modelId, modelVersion, latencyMs,
  });

  if (cfg) {
    const s = cfg.stats || {};
    const n = (s.decisions || 0) + 1;
    cfg.stats = {
      decisions: n,
      autoApplied: (s.autoApplied || 0) + (disposition === 'AUTO_APPLIED' ? 1 : 0),
      escalated: (s.escalated || 0) + (disposition === 'ESCALATED' ? 1 : 0),
      overridden: s.overridden || 0,
      avgConfidence: Math.round((((s.avgConfidence || 0) * (n - 1) + confidence) / n) * 1000) / 1000,
      lastRunAt: new Date(),
    };
    await cfg.save();
  }
  return doc;
};

exports.listDecisions = async (req, res) => {
  const { page, limit, skip, sort } = parseQuery(req.query, { defaultSort: '-at' });
  const filter = {};
  for (const f of ['agentId', 'disposition', 'action']) if (req.query[f]) filter[f] = req.query[f];
  if (req.query.pending === 'true') filter.disposition = { $in: ['AWAITING_REVIEW', 'ESCALATED'] };
  const [items, total] = await Promise.all([
    AiDecision.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    AiDecision.countDocuments(filter),
  ]);
  ok(res, items, { total, page, limit });
};

/** §5.5.3 — a human accepts or overturns a decision; the reason is recorded. */
exports.review = async (req, res) => {
  const doc = await AiDecision.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'Decision not found');
  if (!['AWAITING_REVIEW', 'ESCALATED'].includes(doc.disposition)) {
    throw new ApiError(409, 'This decision has already been reviewed');
  }
  const { accept, reason } = req.body || {};
  if (!accept && !reason) throw new ApiError(400, 'Overturning a decision requires a reason');

  // append-only: the reviewed outcome is a new record superseding the original
  const outcome = accept ? 'APPROVED_BY_HUMAN' : 'OVERRIDDEN';
  const superseding = await AiDecision.create({
    agentId: doc.agentId, agentName: doc.agentName, action: doc.action,
    subjectType: doc.subjectType, subjectId: doc.subjectId, subjectLabel: doc.subjectLabel,
    inputs: doc.inputs, output: doc.output, explanation: doc.explanation, factors: doc.factors,
    confidence: doc.confidence, autonomyLevel: doc.autonomyLevel, threshold: doc.threshold,
    disposition: outcome, reviewedBy: req.user.name, reviewedAt: new Date(),
    overrideReason: accept ? '' : reason, supersedes: doc._id,
    modelId: doc.modelId, modelVersion: doc.modelVersion,
  });

  if (!accept) {
    const cfg = await AgentConfig.findOne({ agentId: doc.agentId });
    if (cfg) {
      cfg.stats = { ...(cfg.stats || {}), overridden: ((cfg.stats && cfg.stats.overridden) || 0) + 1 };
      await cfg.save();
    }
  }
  audit(req, {
    action: accept ? 'AI_DECISION_ACCEPT' : 'AI_DECISION_OVERRIDE', entity: 'AiDecision',
    entityId: doc._id, entityLabel: `${doc.agentName}: ${doc.action}${accept ? '' : ` — ${reason}`}`,
  });
  created(res, superseding);
};

/** Agent performance dashboard — the §6.6 AI SLA metrics. */
/** Run an agent over the records it is responsible for, now. */
exports.run = async (req, res) => {
  const runner = require('../services/agentRunner');
  const cfg = await AgentConfig.findOne({ agentId: req.params.agentId });
  if (!cfg) throw new ApiError(404, 'Agent not found');
  if (!runner.isRunnable(req.params.agentId)) {
    throw new ApiError(400, 'This agent runs on its own schedule and cannot be triggered here');
  }
  if (!cfg.enabled) throw new ApiError(400, 'Agent is disabled');
  const decisions = await runner.run(req.params.agentId);
  audit(req, { action: 'UPDATE', entity: 'AgentConfig', entityId: cfg._id,
    entityLabel: `${cfg.name} run on demand — ${decisions.length} decision(s) recorded` });
  ok(res, {
    ran: cfg.name,
    recorded: decisions.length,
    byDisposition: decisions.reduce((a, d) => ({ ...a, [d.disposition]: (a[d.disposition] || 0) + 1 }), {}),
    decisions: decisions.slice(0, 20),
  });
};

exports.dashboard = async (_req, res) => {
  const [agents, decisions] = await Promise.all([
    AgentConfig.find().lean(),
    AiDecision.find().select('agentId disposition confidence at autonomyLevel').lean(),
  ]);
  const d30 = new Date(Date.now() - 30 * 86400000);
  const recent = decisions.filter((x) => new Date(x.at) >= d30);
  const reviewed = decisions.filter((x) => ['APPROVED_BY_HUMAN', 'OVERRIDDEN'].includes(x.disposition));
  const overridden = reviewed.filter((x) => x.disposition === 'OVERRIDDEN');
  const auto = decisions.filter((x) => x.disposition === 'AUTO_APPLIED');
  ok(res, {
    agents: agents.length,
    active: agents.filter((a) => a.enabled && !a.suspended).length,
    suspended: agents.filter((a) => a.suspended).length,
    byLevel: LEVELS.map((l) => ({ level: l, count: agents.filter((a) => a.autonomyLevel === l).length })),
    decisions: decisions.length,
    decisions30d: recent.length,
    autoAppliedPct: decisions.length ? Math.round((auto.length / decisions.length) * 100) : 0,
    pendingReview: decisions.filter((x) => ['AWAITING_REVIEW', 'ESCALATED'].includes(x.disposition)).length,
    agreementRate: reviewed.length
      ? Math.round(((reviewed.length - overridden.length) / reviewed.length) * 1000) / 10 : null,
    avgConfidence: decisions.length
      ? Math.round((decisions.reduce((s, x) => s + (x.confidence || 0), 0) / decisions.length) * 1000) / 1000 : 0,
    perAgent: agents.map((a) => ({
      agentId: a.agentId, name: a.name, autonomyLevel: a.autonomyLevel, suspended: a.suspended,
      decisions: a.stats?.decisions || 0, escalated: a.stats?.escalated || 0,
      overridden: a.stats?.overridden || 0, agreementRate: withAgreement(a).agreementRate,
    })),
  });
};
