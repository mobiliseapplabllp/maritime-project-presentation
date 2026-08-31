const mongoose = require('mongoose');
const { INSPECTION_TYPES, INSPECTION_STATUS, INSPECTION_RESULTS } = require('../config/constants');

const findingSchema = new mongoose.Schema({
  deficiencyCode: { type: String, required: true },
  description: { type: String, required: true },
  actionCode: { type: String, default: '' },
  dueDate: Date,
  status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
  closedAt: Date,
}, { timestamps: true });

const inspectionSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },  // INS-2026-014
  vessel: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel', required: true },
  portCall: { type: mongoose.Schema.Types.ObjectId, ref: 'PortCall' },
  type: { type: String, enum: INSPECTION_TYPES, required: true },
  inspector: { type: String, required: true },
  plannedAt: { type: Date, required: true },
  startedAt: Date,
  closedAt: Date,
  status: { type: String, enum: INSPECTION_STATUS, default: 'PLANNED' },
  result: { type: String, enum: [...INSPECTION_RESULTS, ''], default: '' },
  scorePct: Number,   // weighted checklist compliance at close (v8)
  detention: { type: Boolean, default: false },
  checklist: [{ seq: Number, text: String, category: String, answer: { type: String, enum: ['YES', 'NO', 'NA', ''], default: '' }, note: { type: String, default: '' } }],
  findings: [findingSchema],
  remarks: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Inspection', inspectionSchema);
