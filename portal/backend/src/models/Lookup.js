const mongoose = require('mongoose');

const lookupSchema = new mongoose.Schema({
  category: { type: String, required: true, index: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  label: { type: String, required: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} }, // e.g. cargoType: {group, unit, mtFactor}
  active: { type: Boolean, default: true },
}, { timestamps: true });

lookupSchema.index({ category: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Lookup', lookupSchema);
