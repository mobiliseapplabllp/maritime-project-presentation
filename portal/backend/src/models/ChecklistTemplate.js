const mongoose = require('mongoose');

// Checklist templates for surveys, audits and HSE walks — built and versioned
// in the Checklist Builder; consumed when an inspection is opened.
const itemSchema = new mongoose.Schema({
  seq: Number,
  text: { type: String, required: true },
  category: { type: String, default: 'General' },            // section within the checklist
  answerType: { type: String, enum: ['YES_NO', 'YES_NO_NA', 'TEXT', 'NUMBER'], default: 'YES_NO_NA' },
  weight: { type: Number, default: 1 },                      // contribution to the compliance score
  critical: { type: Boolean, default: false },               // a NO here fails the checklist outright
  guidance: { type: String, default: '' },                   // inspector help text
}, { _id: true });

const templateSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  inspectionType: { type: String, required: true },          // PSC, FSI, ISM, ISPS, MLC, HSE, TERMINAL…
  description: { type: String, default: '' },
  items: [itemSchema],
  active: { type: Boolean, default: true },
  version: { type: Number, default: 1 },
  passScorePct: { type: Number, default: 80 },
}, { timestamps: true });

module.exports = mongoose.model('ChecklistTemplate', templateSchema);
