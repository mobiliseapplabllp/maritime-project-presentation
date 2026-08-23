const mongoose = require('mongoose');
const { PORTCALL_STATUS } = require('../config/constants');

const serviceSchema = new mongoose.Schema({
  type: { type: String, required: true },       // PILOTAGE, TUGS, FRESH_WATER, GARBAGE, ANCHORAGE...
  tariffCode: { type: String, default: '' },
  description: { type: String, default: '' },
  qty: { type: Number, default: 1 },
  unit: { type: String, default: '' },
  at: Date,
  remarks: { type: String, default: '' },
}, { timestamps: true });

const cargoOpSchema = new mongoose.Schema({
  cargoType: { type: String, required: true }, // lookup cargoType code
  operation: { type: String, enum: ['DISCHARGE', 'LOAD'], required: true },
  qty: { type: Number, required: true },
  unit: { type: String, enum: ['MT', 'TEU', 'UNITS'], required: true },
  qtyMT: { type: Number, default: 0 },          // normalised tonnage for throughput stats
  gangs: { type: Number, default: 0 },
  startedAt: Date,
  completedAt: Date,
  remarks: { type: String, default: '' },
}, { timestamps: true });

const portCallSchema = new mongoose.Schema({
  vcn: { type: String, required: true, unique: true }, // voyage call number MUN-2026-0154
  vessel: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel', required: true },
  agentCode: { type: String, default: '' },
  agentName: { type: String, default: '' },
  purpose: { type: String, default: '' },
  status: { type: String, enum: PORTCALL_STATUS, default: 'ANNOUNCED' },
  eta: { type: Date, required: true },
  etb: Date,
  etd: Date,
  ata: Date,       // actual arrival (anchorage/pilot station)
  atb: Date,       // actual berthing
  atd: Date,       // actual departure
  berth: { type: mongoose.Schema.Types.ObjectId, ref: 'Berth' },
  prevPort: { type: String, default: '' },  // "SGSIN — Singapore"
  nextPort: { type: String, default: '' },
  draftArrival: Number,
  draftDeparture: Number,
  crew: { count: { type: Number, default: 0 }, master: { type: String, default: '' } },
  services: [serviceSchema],
  cargoOps: [cargoOpSchema],
  remarks: { type: String, default: '' },
  statusHistory: [{ from: String, to: String, at: Date, by: String, note: String }],
}, { timestamps: true });

module.exports = mongoose.model('PortCall', portCallSchema);
