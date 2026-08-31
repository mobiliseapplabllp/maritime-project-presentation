const mongoose = require('mongoose');
const { SEAFARER_RANKS } = require('../config/constants');

const sfCertSchema = new mongoose.Schema({
  certType: { type: String, required: true },
  grade: { type: String, default: '' },          // e.g. 'Class 1 (Master FG)'
  number: { type: String, default: '' },
  issuer: { type: String, default: 'DG Shipping, India' },
  issueDate: Date,
  expiryDate: { type: Date, required: true },
  remarks: { type: String, default: '' },
}, { timestamps: true });

const seaServiceSchema = new mongoose.Schema({
  vesselName: { type: String, required: true },
  imo: { type: String, default: '' },
  rank: { type: String, required: true },
  from: { type: Date, required: true },
  to: { type: Date, required: true },
  verified: { type: Boolean, default: false },   // cross-checked against movement records
  remarks: { type: String, default: '' },
}, { timestamps: true });

const seafarerSchema = new mongoose.Schema({
  cdcNo: { type: String, required: true, unique: true, uppercase: true },   // continuous discharge certificate
  indosNo: { type: String, default: '' },
  name: { type: String, required: true },
  dob: Date,
  nationality: { type: String, default: 'India' },
  rank: { type: String, enum: SEAFARER_RANKS, required: true },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  status: { type: String, enum: ['ACTIVE', 'SHORE_LEAVE', 'SIGNED_OFF', 'SUSPENDED'], default: 'ACTIVE' },
  currentVessel: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel' },
  signedOnAt: Date,   // start of the current tour (v8 sign-on wizard)
  certificates: [sfCertSchema],
  seaService: [seaServiceSchema],
  remarks: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Seafarer', seafarerSchema);
