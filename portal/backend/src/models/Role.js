const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  permissions: { type: [String], default: [] }, // 'module.action' strings, or ['*']
  system: { type: Boolean, default: false },    // seeded roles that cannot be deleted
}, { timestamps: true });

module.exports = mongoose.model('Role', roleSchema);
