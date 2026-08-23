const mongoose = require('mongoose');
const { LICENSE_TYPES, LICENSE_STATUS } = require('../config/constants');

const licAuditSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  auditor: { type: String, required: true },
  result: { type: String, enum: ['SATISFACTORY', 'OBSERVATIONS', 'NON_CONFORMITY'], required: true },
  remarks: { type: String, default: '' },
}, { timestamps: true });

const licenseSchema = new mongoose.Schema({
  licenseNo: { type: String, required: true, unique: true },
  entityName: { type: String, required: true },
  entityType: { type: String, enum: LICENSE_TYPES, required: true },
  status: { type: String, enum: LICENSE_STATUS, default: 'APPLIED' },
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
