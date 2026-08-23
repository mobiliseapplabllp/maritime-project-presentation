const mongoose = require('mongoose');

const berthSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  name: { type: String, required: true },
  terminal: { type: String, required: true },
  berthType: { type: String, enum: ['CONTAINER', 'BULK', 'MULTIPURPOSE', 'LIQUID', 'RORO', 'SPM', 'COAL'], required: true },
  loaMax: { type: Number, required: true },   // metres
  draftMax: { type: Number, required: true }, // metres
  status: { type: String, enum: ['OPERATIONAL', 'MAINTENANCE'], default: 'OPERATIONAL' },
  remarks: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Berth', berthSchema);
