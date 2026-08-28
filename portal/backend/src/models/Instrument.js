const mongoose = require('mongoose');
const { INSTRUMENT_TYPES, INSTRUMENT_STATUS } = require('../config/constants');

const instrumentSchema = new mongoose.Schema({
  refNo: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  type: { type: String, enum: INSTRUMENT_TYPES, required: true },
  category: { type: String, default: 'General' },   // Safety / Environment / Crew / Security / Port Ops / Tariff
  status: { type: String, enum: INSTRUMENT_STATUS, default: 'IN_FORCE' },
  issuedBy: { type: String, default: 'Directorate General of Shipping' },
  issuedDate: Date,
  effectiveDate: Date,
  summary: { type: String, default: '' },
  body: { type: String, default: '' },
  tags: { type: [String], default: [] },
  supersedes: { type: String, default: '' },        // refNo of superseded instrument
  ackRequired: { type: Boolean, default: false },
  acknowledgedBy: [{ userId: String, name: String, at: Date }],

  // publication governance — who drafted it and who put it in force. Held as
  // separate fields precisely so the two can be compared.
  draftedBy: { type: String, default: '' },
  draftedByName: { type: String, default: '' },
  approvedBy: { type: String, default: '' },
  approvedByName: { type: String, default: '' },
  approvedAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('Instrument', instrumentSchema);
