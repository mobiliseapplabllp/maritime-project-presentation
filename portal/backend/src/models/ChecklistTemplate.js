const mongoose = require('mongoose');

const templateSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  inspectionType: { type: String, required: true },
  items: [{ seq: Number, text: { type: String, required: true }, category: { type: String, default: 'General' } }],
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('ChecklistTemplate', templateSchema);
