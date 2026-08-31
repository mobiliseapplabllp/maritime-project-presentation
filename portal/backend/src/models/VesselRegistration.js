const mongoose = require('mongoose');
const {
  REGISTRATION_KINDS, REGISTRATION_STATUS, DELETION_REASONS, AMENDMENT_TYPES,
} = require('../config/constants');

/* B1 — one application to the Registrar of Indian Ships.
 *
 * Four journeys share this record because they share a file: a first
 * registration, the provisional certificate that bridges a ship bought abroad,
 * an amendment to an existing entry, and the closure of the entry when the ship
 * leaves the flag. Each is scrutinised on the same evidence, decided by the same
 * officer and written into the same register, so splitting them into four models
 * would only mean maintaining the same lifecycle four times.
 *
 * The register entry is the ship's identity document. Everything else this
 * platform issues against a vessel — navigation licence, statutory certificate,
 * safe manning document — presupposes it. */

const ownerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  address: { type: String, default: '' },
  nationality: { type: String, default: 'Indian' },
  // shares of the statutory divisor held by this owner (see the jurisdiction
  // profile — the divisor is a statutory number, not a constant of this code)
  shares: { type: Number, required: true, min: 0 },
  kind: { type: String, enum: ['INDIVIDUAL', 'BODY_CORPORATE', 'COOPERATIVE_SOCIETY'], default: 'BODY_CORPORATE' },
  pan: { type: String, default: '' },
  cin: { type: String, default: '' },            // body corporate registration
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
}, { _id: false });

const evidenceSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, default: '' },
  reference: { type: String, default: '' },      // document number as issued
  issuedBy: { type: String, default: '' },
  issuedOn: Date,
  fileName: { type: String, default: '' },
  verified: { type: Boolean, default: false },
  verifiedBy: { type: String, default: '' },
  verifiedAt: Date,
}, { _id: true });

// A subsisting mortgage stops a registry entry being closed. Recording it here
// keeps that rule enforceable now; a full encumbrance register is a later
// package, and this is the hook it will attach to.
const encumbranceSchema = new mongoose.Schema({
  kind: { type: String, enum: ['MORTGAGE', 'LIEN', 'CHARGE'], default: 'MORTGAGE' },
  holder: { type: String, required: true },
  amount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  registeredOn: Date,
  dischargedOn: Date,
  reference: { type: String, default: '' },
}, { _id: true });

const vesselRegistrationSchema = new mongoose.Schema({
  applicationNo: { type: String, required: true, unique: true },
  kind: { type: String, enum: REGISTRATION_KINDS, required: true, index: true },
  vessel: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel', required: true, index: true },
  vesselName: { type: String, default: '' },     // as applied for — a name change is an amendment
  imo: { type: String, default: '' },

  portOfRegistry: { type: String, required: true },     // code from the jurisdiction profile
  portOfRegistryName: { type: String, default: '' },

  applicant: {
    name: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    capacity: { type: String, default: 'Owner' },       // owner, managing owner, authorised agent
  },

  owners: [ownerSchema],
  tonnage: {
    gross: Number,
    net: Number,
    measuredBy: { type: String, default: '' },          // surveyor or recognised organisation
    certificateNo: { type: String, default: '' },
    measuredOn: Date,
  },

  // where the ship came from — a foreign-flagged ship cannot join this register
  // until the previous registry has closed its entry
  previousFlag: { type: String, default: '' },
  previousRegistry: { type: String, default: '' },
  previousOfficialNumber: { type: String, default: '' },

  evidence: [evidenceSchema],
  encumbrances: [encumbranceSchema],

  // s.30 — the official number and registered tonnage are cut into the main
  // beam before the certificate is granted, and a surveyor reports compliance
  carvingNote: {
    number: { type: String, default: '' },
    issuedOn: Date,
    issuedBy: { type: String, default: '' },
    compliedOn: Date,
    surveyor: { type: String, default: '' },
    remarks: { type: String, default: '' },
  },

  amendment: {
    types: { type: [String], enum: AMENDMENT_TYPES, default: undefined },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    approvalReference: { type: String, default: '' },   // e.g. name-change approval
  },

  deletion: {
    reason: { type: String, enum: [...DELETION_REASONS, ''], default: '' },
    newFlag: { type: String, default: '' },
    effectiveOn: Date,
    certificateNo: { type: String, default: '' },
    issuedOn: Date,
  },

  status: { type: String, enum: REGISTRATION_STATUS, default: 'DRAFT', index: true },
  checks: [{ check: String, passed: Boolean, blocking: Boolean, detail: String }],
  assignedTo: { type: String, default: '' },

  // set on grant
  officialNumber: { type: String, default: '', index: true },
  certificateNo: { type: String, default: '' },
  grantedOn: Date,
  grantedBy: { type: String, default: '' },
  certificateExpiresOn: Date,                  // provisional certificates only
  fee: { amount: { type: Number, default: 0 }, currency: { type: String, default: 'INR' }, paid: { type: Boolean, default: false } },

  decision: { outcome: { type: String, enum: ['GRANTED', 'REJECTED', ''], default: '' }, by: String, at: Date, reason: { type: String, default: '' } },
  submittedAt: Date,
  dueAt: Date,
  closedAt: Date,
  history: [{ from: String, to: String, at: Date, by: String, note: String }],
}, { timestamps: true });

vesselRegistrationSchema.index({ vessel: 1, kind: 1, status: 1 });
vesselRegistrationSchema.index({ status: 1, dueAt: 1 });

module.exports = mongoose.model('VesselRegistration', vesselRegistrationSchema);
