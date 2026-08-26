const mongoose = require('mongoose');

/* A3 — the immutable record of every AI decision.
 *
 * RFP §5.5.1 requires a complete, immutable log of every agent decision, action,
 * input and output, and §5.5.3 requires every decision to be explainable and
 * overridable with the reason logged. This is that record.
 *
 * It is deliberately separate from the general audit trail: an AI decision has
 * inputs, a confidence, a model version and an autonomy level that a user action
 * does not, and regulators audit it on different terms. Writes are append-only —
 * an override is a new record referencing the original, never an edit. */
const aiDecisionSchema = new mongoose.Schema({
  agentId: { type: String, required: true, index: true },
  agentName: { type: String, default: '' },
  action: { type: String, required: true },        // what the agent decided to do
  subjectType: { type: String, default: '' },      // ServiceRequest / License / Vessel …
  subjectId: { type: String, default: '' },
  subjectLabel: { type: String, default: '' },

  inputs: { type: mongoose.Schema.Types.Mixed },   // what it was given
  output: { type: mongoose.Schema.Types.Mixed },   // what it produced
  // the human-readable reasoning, required by §5.9 AI Explainability
  explanation: { type: String, default: '' },
  factors: [{ factor: String, weight: Number, value: String, contribution: Number }],

  confidence: { type: Number, min: 0, max: 1, default: 0 },
  autonomyLevel: { type: String, enum: ['SUPERVISED', 'ASSISTED', 'AUTONOMOUS'], required: true },
  threshold: { type: Number, default: 0 },         // the threshold in force at the time

  // what actually happened as a result
  disposition: {
    type: String,
    enum: ['AUTO_APPLIED', 'ESCALATED', 'AWAITING_REVIEW', 'APPROVED_BY_HUMAN', 'OVERRIDDEN', 'REJECTED_BY_HUMAN'],
    default: 'AWAITING_REVIEW', index: true,
  },
  escalationReason: { type: String, default: '' },
  reviewedBy: { type: String, default: '' },
  reviewedAt: Date,
  overrideReason: { type: String, default: '' },
  supersedes: { type: mongoose.Schema.Types.ObjectId, ref: 'AiDecision' },

  modelId: { type: String, default: '' },
  modelVersion: { type: String, default: '' },
  latencyMs: { type: Number, default: 0 },
  at: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

aiDecisionSchema.index({ agentId: 1, at: -1 });
aiDecisionSchema.index({ disposition: 1, at: -1 });

// Append-only: block any attempt to rewrite a recorded decision.
aiDecisionSchema.pre('findOneAndUpdate', function blockUpdate(next) {
  next(new Error('AI decisions are append-only — record a superseding decision instead'));
});
aiDecisionSchema.pre('updateOne', function blockUpdate(next) {
  next(new Error('AI decisions are append-only — record a superseding decision instead'));
});

module.exports = mongoose.model('AiDecision', aiDecisionSchema);
