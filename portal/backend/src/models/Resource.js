const mongoose = require('mongoose');
const { RESOURCE_TYPES } = require('../config/constants');

// Marine craft & pilots operated by the port — tugs, pilot launches, mooring boats, pilots on roster.
const resourceSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },   // TUG-01, PLT-03
  name: { type: String, required: true },                 // "Mundra Shakti"
  type: { type: String, enum: RESOURCE_TYPES, required: true },
  spec: { type: String, default: '' },                    // "ASD tug — 52 T bollard pull"
  status: { type: String, enum: ['AVAILABLE', 'TASKED', 'MAINTENANCE', 'OFF_DUTY'], default: 'AVAILABLE' },
  currentTask: { type: String, default: '' },             // "MUN-2026-0412 — berthing CT3-2"
  master: { type: String, default: '' },                  // craft master / pilot name
  contact: { type: String, default: '' },                 // VHF channel or phone
  remarks: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Resource', resourceSchema);
