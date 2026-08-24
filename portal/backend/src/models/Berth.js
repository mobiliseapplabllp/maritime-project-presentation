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
  // maintenance and outage windows taken over the berth's life, newest last
  outages: [{
    from: Date, to: Date,
    days: { type: Number, default: 0 },
    kind: { type: String, default: '' },       // PLANNED / BREAKDOWN / DREDGING / WEATHER
    reason: { type: String, default: '' },
    by: { type: String, default: '' },
  }],
}, { timestamps: true });

module.exports = mongoose.model('Berth', berthSchema);
