const mongoose = require('mongoose');
const { SUBJECT_KINDS, REQUEST_STATUS } = require('../config/constants');

/* A2 — one application against one service definition.
 *
 * This is the record an external applicant creates and tracks, and the record
 * an officer assesses. It carries its own SLA clock so breach is a fact on the
 * document rather than something a report has to infer. */

const attachmentSchema = new mongoose.Schema({
  key: { type: String, required: true },        // matches ServiceDefinition.requiredDocuments.key
  label: { type: String, default: '' },
  fileName: { type: String, default: '' },
  uploadedAt: { type: Date, default: Date.now },
  verified: { type: Boolean, default: false },
  verifiedBy: { type: String, default: '' },
  verifiedAt: Date,
  notes: { type: String, default: '' },
  // A6 will populate this; recorded here so the shape is stable
  extraction: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

const serviceRequestSchema = new mongoose.Schema({
  requestNo: { type: String, required: true, unique: true },
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceDefinition', required: true },
  serviceCode: { type: String, required: true, index: true },
  serviceName: { type: String, default: '' },
  domain: { type: Number, index: true },

  applicant: {
    userId: String,
    name: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    organisation: { type: String, default: '' },
  },

  subjectKind: { type: String, enum: SUBJECT_KINDS },
  subjectRef: { type: mongoose.Schema.Types.ObjectId, refPath: 'subjectModel' },
  subjectModel: { type: String, enum: ['Company', 'Vessel', 'Seafarer', 'Berth'] },
  subjectLabel: { type: String, default: '' },

  formData: { type: mongoose.Schema.Types.Mixed, default: {} },
  documents: [attachmentSchema],

  status: { type: String, enum: REQUEST_STATUS, default: 'DRAFT', index: true },
  currentStage: { type: String, default: '' },
  assignedTo: { type: String, default: '' },

  // the eligibility checks that ran, mirrored from the A1 engine at decision time
  checks: [{ check: String, passed: Boolean, detail: String }],

  decision: {
    outcome: { type: String, enum: ['APPROVED', 'REJECTED', ''], default: '' },
    by: String,
    at: Date,
    reason: { type: String, default: '' },
    automated: { type: Boolean, default: false },
  },
  issuedInstrument: { type: mongoose.Schema.Types.ObjectId, ref: 'License' },

  fee: {
    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },
    paid: { type: Boolean, default: false },
    paidAt: Date,
    reference: { type: String, default: '' },
  },

  submittedAt: Date,
  dueAt: Date,               // submittedAt + the definition's SLA
  closedAt: Date,
  history: [{ from: String, to: String, at: Date, by: String, note: String }],
}, { timestamps: true });

serviceRequestSchema.index({ status: 1, dueAt: 1 });
serviceRequestSchema.index({ 'applicant.userId': 1, createdAt: -1 });

/** Open past its due date — the SLA fact the dashboards and reports read. */
serviceRequestSchema.virtual('slaBreached').get(function slaBreached() {
  if (!this.dueAt || this.closedAt) return false;
  return new Date() > this.dueAt;
});
serviceRequestSchema.set('toJSON', { virtuals: true });
serviceRequestSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('ServiceRequest', serviceRequestSchema);
