const mongoose = require('mongoose');
const {
  INCIDENT_CATEGORIES, INCIDENT_TYPES, INCIDENT_STATUS, INCIDENT_SEVERITY,
  INCIDENT_PRIORITIES, INCIDENT_SOURCES,
} = require('../config/constants');

const commSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  by: { type: String, required: true },            // person logging / speaking
  channel: { type: String, enum: INCIDENT_SOURCES, default: 'PORTAL' },
  direction: { type: String, enum: ['IN', 'OUT', 'INTERNAL'], default: 'INTERNAL' },
  message: { type: String, required: true },
}, { _id: true });

const documentSchema = new mongoose.Schema({
  name: { type: String, required: true },          // "boom-deployment-photos.zip"
  docType: { type: String, default: 'OTHER' },     // PHOTO, REPORT, STATEMENT, SAMPLE, PERMIT, CCTV, OTHER
  sizeKB: { type: Number, default: 0 },
  uploadedBy: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  note: { type: String, default: '' },
}, { _id: true });

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  assignee: { type: String, default: '' },
  due: Date,
  status: { type: String, enum: ['OPEN', 'DONE'], default: 'OPEN' },
  doneAt: Date,
}, { _id: true });

const incidentSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },   // INC-2026-0142
  category: { type: String, enum: INCIDENT_CATEGORIES, default: 'MARINE' },
  type: { type: String, enum: INCIDENT_TYPES, required: true },
  severity: { type: String, enum: INCIDENT_SEVERITY, default: 'MEDIUM' },
  priority: { type: String, enum: INCIDENT_PRIORITIES, default: 'P3' },
  status: { type: String, enum: INCIDENT_STATUS, default: 'OPEN' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  vessel: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel' },
  vesselName: { type: String, default: '' },       // for non-registered craft (FV, dhow, barge)
  berth: { type: mongoose.Schema.Types.ObjectId, ref: 'Berth' },
  location: { area: { type: String, default: '' }, lat: Number, lon: Number },
  position: { lat: Number, lon: Number },          // kept for the surveillance map overlay
  reportedAt: { type: Date, required: true },
  reportedBy: { type: String, default: '' },
  source: { type: String, enum: INCIDENT_SOURCES, default: 'PORTAL' },
  assignedTo: { userId: String, name: { type: String, default: '' } },
  assets: { type: [String], default: [] },         // tugs, launches, boom crews tasked
  injuries: { type: Number, default: 0 },
  pollutionTier: { type: Number, default: 0 },     // 0 none, 1-3 per OSCP
  weather: { windKn: Number, seaState: Number },
  comms: [commSchema],
  documents: [documentSchema],
  tasks: [taskSchema],
  log: [{ at: Date, by: String, entry: String }],  // operational log entries
  statusHistory: [{ from: String, to: String, at: Date, by: String, note: String }],
  rca: {
    rootCause: { type: String, default: '' },
    category: { type: String, default: '' },       // Human factor / Equipment / Procedure / Weather / External
    correctiveAction: { type: String, default: '' },
    preventiveAction: { type: String, default: '' },
  },
  acknowledgedAt: Date,
  resolvedAt: Date,
  closedAt: Date,
  outcome: { type: String, default: '' },
}, { timestamps: true });

incidentSchema.index({ status: 1, severity: 1 });
incidentSchema.index({ reportedAt: -1 });

module.exports = mongoose.model('Incident', incidentSchema);
