const mongoose = require('mongoose');

// Simulated AIS picture — one document per tracked vessel (upserted by the seed/simulator).
const positionSchema = new mongoose.Schema({
  vessel: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel', unique: true },
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  course: { type: Number, default: 0 },
  speed: { type: Number, default: 0 },           // knots
  navStatus: { type: String, enum: ['MOORED', 'AT_ANCHOR', 'UNDERWAY', 'RESTRICTED'], default: 'UNDERWAY' },
  destination: { type: String, default: '' },
  receivedAt: { type: Date, default: Date.now },
  source: { type: String, default: 'AIS-T (simulated)' },
}, { timestamps: true });

module.exports = mongoose.model('Position', positionSchema);
