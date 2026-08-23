const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  certType: { type: String, required: true },   // e.g. 'Safety Management Certificate'
  number: { type: String, default: '' },
  issuer: { type: String, default: '' },
  issueDate: Date,
  expiryDate: { type: Date, required: true },
  remarks: { type: String, default: '' },
}, { timestamps: true });

const vesselSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  imo: { type: String, required: true, unique: true, trim: true },
  mmsi: { type: String, default: '' },
  callSign: { type: String, default: '' },
  flag: { type: String, required: true },
  type: { type: String, required: true },       // lookup vesselType code
  built: Number,
  dwt: Number,
  grt: { type: Number, required: true },
  loa: Number,
  beam: Number,
  maxDraft: Number,
  owner: { type: String, default: '' },
  operator: { type: String, default: '' },      // commercial operator / charterer
  manager: { type: String, default: '' },       // technical / ISM manager
  agent: { type: String, default: '' },         // lookup agent code
  classSociety: { type: String, default: '' },
  piClub: { type: String, default: '' },
  portOfRegistry: { type: String, default: '' },
  yard: { type: String, default: '' },          // builder
  engine: { maker: String, model: String, powerKW: Number },
  serviceSpeedKn: Number,
  teuCapacity: Number,                          // container ships only
  lastDryDock: Date,
  nextDryDock: Date,
  liner: { type: Boolean, default: false },     // mainline service caller (documented schedule entry)
  status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
  certificates: [certificateSchema],
}, { timestamps: true });

module.exports = mongoose.model('Vessel', vesselSchema);
