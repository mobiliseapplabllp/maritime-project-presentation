const mongoose = require('mongoose');
const { LICENSE_TYPES, LICENSE_STATUS, SUBJECT_KINDS, INSTRUMENT_CLASSES,
  ENDORSEMENT_KINDS, ENDORSEMENT_RESULTS } = require('../config/constants');

const licAuditSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  auditor: { type: String, required: true },
  result: { type: String, enum: ['SATISFACTORY', 'OBSERVATIONS', 'NON_CONFORMITY'], required: true },
  remarks: { type: String, default: '' },
}, { timestamps: true });

// A1 — one regulated-instrument record, whatever it is issued against. The
// subject is polymorphic; entityName stays denormalised so registers, exports
// and the public verification page read without a join.
/* B2 — a survey endorsement on a statutory certificate. The certificate stays
 * the same document through its term; what changes is the record of surveys
 * carried out on it, which is what a port state control officer actually reads. */
const endorsementSchema = new mongoose.Schema({
  kind: { type: String, enum: ENDORSEMENT_KINDS, required: true },
  anniversary: Date,                 // the due date the endorsement answers to
  completedOn: { type: Date, required: true },
  surveyor: { type: String, required: true },
  organisation: { type: String, default: '' },   // recognised organisation acting for the flag
  place: { type: String, default: '' },
  result: { type: String, enum: ENDORSEMENT_RESULTS, default: 'ENDORSED' },
  remarks: { type: String, default: '' },
}, { timestamps: true });

const licenseSchema = new mongoose.Schema({
  licenseNo: { type: String, required: true, unique: true },
  subjectKind: { type: String, enum: SUBJECT_KINDS, default: 'COMPANY', index: true },
  subjectRef: { type: mongoose.Schema.Types.ObjectId, refPath: 'subjectModel' },
  subjectModel: { type: String, enum: ['Company', 'Vessel', 'Seafarer', 'Berth'] },
  instrumentClass: { type: String, enum: INSTRUMENT_CLASSES, default: 'LICENCE', index: true },
  entityName: { type: String, required: true },
  entityType: { type: String, enum: LICENSE_TYPES, required: true },
  status: { type: String, enum: LICENSE_STATUS, default: 'APPLIED' },
  // recorded at issue: which dependency checks ran and what they returned, so a
  // decision can be re-read later exactly as it was made
  issueChecks: [{ check: String, passed: Boolean, detail: String }],
  contactPerson: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  gstin: { type: String, default: '' },
  appliedDate: Date,
  issueDate: Date,
  expiryDate: Date,
  conditions: { type: String, default: '' },
  performanceRating: { type: Number, min: 0, max: 5, default: 0 },
  audits: [licAuditSchema],
  // B2 — survey endorsements through the certificate's term
  endorsements: [endorsementSchema],
  /* B2 — the signature over this record, taken at issue. The signed payload is
   * deliberately not stored: verification recomputes it from the fields above,
   * so any later alteration to the register entry breaks the signature. */
  signature: {
    alg: { type: String, default: '' },
    keyId: { type: String, default: '' },
    value: { type: String, default: '' },
    signedAt: Date,
  },
  history: [{ from: String, to: String, at: Date, by: String, note: String }],
}, { timestamps: true });

module.exports = mongoose.model('License', licenseSchema);
