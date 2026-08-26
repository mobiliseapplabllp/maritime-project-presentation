const mongoose = require('mongoose');
const { LICENSE_TYPES, LICENSE_STATUS, SUBJECT_KINDS, INSTRUMENT_CLASSES } = require('../config/constants');

const licAuditSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  auditor: { type: String, required: true },
  result: { type: String, enum: ['SATISFACTORY', 'OBSERVATIONS', 'NON_CONFORMITY'], required: true },
  remarks: { type: String, default: '' },
}, { timestamps: true });

// A1 — one regulated-instrument record, whatever it is issued against. The
// subject is polymorphic; entityName stays denormalised so registers, exports
// and the public verification page read without a join.
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
  history: [{ from: String, to: String, at: Date, by: String, note: String }],
}, { timestamps: true });

module.exports = mongoose.model('License', licenseSchema);
