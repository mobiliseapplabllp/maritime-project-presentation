const mongoose = require('mongoose');

/* A3 — per-agent autonomy configuration.
 *
 * RFP §5.5.1 requires configurable autonomy from fully supervised through to
 * fully autonomous, changeable by the Client without vendor involvement, and
 * §8.4 requires the authority to be able to suspend a misbehaving agent within
 * four hours. Both are settings on this record, not code.
 *
 * Autonomy is raised deliberately and the change is recorded, because raising
 * it is a governance decision the AI Governance Committee has to be able to
 * evidence afterwards. */
const agentConfigSchema = new mongoose.Schema({
  agentId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  role: { type: String, default: '' },
  domain: { type: Number, min: 1, max: 7 },

  enabled: { type: Boolean, default: true },
  // SUPERVISED  — every recommendation is reviewed before it takes effect
  // ASSISTED    — acts alone above the confidence threshold, escalates below it
  // AUTONOMOUS  — acts and notifies
  autonomyLevel: { type: String, enum: ['SUPERVISED', 'ASSISTED', 'AUTONOMOUS'], default: 'SUPERVISED' },
  confidenceThreshold: { type: Number, min: 0, max: 1, default: 0.85 },
  maxActionsPerHour: { type: Number, default: 100 },
  escalateTo: { type: String, default: '' },        // permission or role that reviews

  // §8.4 — suspension pending investigation, with the reason on the record
  suspended: { type: Boolean, default: false },
  suspendedReason: { type: String, default: '' },
  suspendedBy: { type: String, default: '' },
  suspendedAt: Date,

  // rolling performance, updated as decisions are recorded
  stats: {
    decisions: { type: Number, default: 0 },
    autoApplied: { type: Number, default: 0 },
    escalated: { type: Number, default: 0 },
    overridden: { type: Number, default: 0 },
    avgConfidence: { type: Number, default: 0 },
    lastRunAt: Date,
  },

  // every autonomy change, so a governance committee can evidence the sequence
  changes: [{ field: String, from: String, to: String, at: Date, by: String, reason: String }],
}, { timestamps: true });

/** Accuracy proxy: the share of decisions a human did not have to overturn. */
agentConfigSchema.virtual('agreementRate').get(function agreementRate() {
  const s = this.stats || {};
  if (!s.decisions) return null;
  return Math.round(((s.decisions - (s.overridden || 0)) / s.decisions) * 1000) / 10;
});
agentConfigSchema.set('toJSON', { virtuals: true });
agentConfigSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('AgentConfig', agentConfigSchema);
