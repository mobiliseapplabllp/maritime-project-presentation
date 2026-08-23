const mongoose = require('mongoose');
const { INCIDENT_TYPES, INCIDENT_STATUS, INCIDENT_SEVERITY } = require('../config/constants');

const incidentSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },   // MRCC-2026-014
  type: { type: String, enum: INCIDENT_TYPES, required: true },
  severity: { type: String, enum: INCIDENT_SEVERITY, default: 'MEDIUM' },
  status: { type: String, enum: INCIDENT_STATUS, default: 'OPEN' },
  title: { type: String, required: true },
  vessel: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel' },
  vesselName: { type: String, default: '' },     // for non-registered craft (FV, dhow)
  position: { lat: Number, lon: Number },
  reportedAt: { type: Date, required: true },
  reportedBy: { type: String, default: '' },
  closedAt: Date,
  assets: { type: [String], default: [] },       // tugs, pilot boats, ISV, helicopters tasked
  log: [{ at: Date, by: String, entry: String }],
  outcome: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Incident', incidentSchema);
