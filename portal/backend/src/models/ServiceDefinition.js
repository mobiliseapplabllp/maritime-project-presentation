const mongoose = require('mongoose');
const { SUBJECT_KINDS, LICENSE_TYPES } = require('../config/constants');

/* A2 — the service catalogue.
 *
 * Every regulatory service the authority offers has the same shape: an
 * applicant submits a form and documents, an officer assesses them against
 * stated criteria, a decision is recorded, and — where the service issues one —
 * an instrument is produced through the A1 engine.
 *
 * Because that shape is constant, a service is data rather than code. Adding a
 * service means adding a definition, not a release. Every user-visible string
 * carries a local-language label beside the English one, so a single definition
 * drives both interfaces whatever the deployment's second language is. */

const fieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  labelLocal: { type: String, default: '' },
  type: { type: String, enum: ['text', 'number', 'date', 'select', 'checkbox', 'textarea'], default: 'text' },
  options: [String],
  required: { type: Boolean, default: false },
  help: { type: String, default: '' },
}, { _id: false });

const docSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  labelLocal: { type: String, default: '' },
  mandatory: { type: Boolean, default: true },
  acceptedFormats: { type: String, default: 'PDF, JPG, PNG' },
}, { _id: false });

const stageSchema = new mongoose.Schema({
  key: { type: String, required: true },     // SCREENING / TECHNICAL_REVIEW / APPROVAL
  label: { type: String, required: true },
  labelLocal: { type: String, default: '' },
  perm: { type: String, default: '' },        // permission that may action this stage
  slaDays: { type: Number, default: 3 },
}, { _id: false });

const serviceDefinitionSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  name: { type: String, required: true },
  nameLocal: { type: String, default: '' },
  domain: { type: Number, min: 1, max: 7, required: true },   // the RFP business domain
  description: { type: String, default: '' },
  descriptionLocal: { type: String, default: '' },

  // what the service is about, and what it produces
  subjectKind: { type: String, enum: SUBJECT_KINDS, required: true },
  subjectRequired: { type: Boolean, default: true },
  // when set, approval issues this instrument through the A1 licensing engine
  issuesInstrument: { type: String, enum: [...LICENSE_TYPES, ''], default: '' },

  formFields: [fieldSchema],
  requiredDocuments: [docSchema],
  stages: [stageSchema],

  fee: { amount: { type: Number, default: 0 }, currency: { type: String, default: 'INR' } },
  slaDays: { type: Number, default: 10 },          // end-to-end target
  // an applicant may lodge this without an officer ever touching it when every
  // check passes — the straight-through path the national AI directive wants
  autoApprovable: { type: Boolean, default: false },

  active: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
}, { timestamps: true });

serviceDefinitionSchema.index({ domain: 1, active: 1 });

module.exports = mongoose.model('ServiceDefinition', serviceDefinitionSchema);
