const mongoose = require('mongoose');

const tariffSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, uppercase: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['MARINE', 'CARGO', 'MISC'], default: 'MARINE' },
  unit: { type: String, required: true },  // 'per GRT', 'per movement', 'per TEU', 'per MT', 'per call', 'per day'
  rate: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('TariffItem', tariffSchema);
