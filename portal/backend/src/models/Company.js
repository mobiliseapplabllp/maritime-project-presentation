const mongoose = require('mongoose');

// Port companies directory — every organisation operating inside port limits:
// shipping agents, terminal operators, stevedores, suppliers, yards, institutes.
const companySchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },      // KSA, GTS, SBL…
  name: { type: String, required: true },
  types: { type: [String], default: [] },                    // SHIPPING_AGENCY, TERMINAL_OPERATOR, …
  category: { type: String, enum: ['AGENCY', 'TERMINAL_OPERATOR', 'SERVICE_PROVIDER', 'SUPPLIER', 'INSTITUTE'], default: 'SERVICE_PROVIDER' },
  contactPerson: { type: String, default: '' },
  phone: { type: String, default: '' },
  email: { type: String, default: '' },
  address: { type: String, default: '' },
  city: { type: String, default: 'Harbour' },
  state: { type: String, default: 'Coastal Region' },
  gstin: { type: String, default: '' },
  pan: { type: String, default: '' },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'BLACKLISTED', 'INACTIVE'], default: 'ACTIVE' },
  onboardedAt: Date,
  rating: { type: Number, default: 0 },                       // 0–5 performance rating
  remarks: { type: String, default: '' },
  real: { type: Boolean, default: false },                    // documented operator (JV terminals) vs demo entity
}, { timestamps: true });

module.exports = mongoose.model('Company', companySchema);
