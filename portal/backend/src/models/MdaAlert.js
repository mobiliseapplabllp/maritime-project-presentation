const mongoose = require('mongoose');

const mdaAlertSchema = new mongoose.Schema({
  type: { type: String, enum: ['AIS_GAP', 'SPEED_IN_CHANNEL', 'ZONE_ENTRY', 'ANCHOR_DRIFT', 'CLOSE_QUARTERS'], required: true },
  severity: { type: String, enum: ['info', 'warning', 'error'], default: 'warning' },
  vessel: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel' },
  vesselName: { type: String, default: '' },
  note: { type: String, default: '' },
  at: { type: Date, default: Date.now },
  acknowledged: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('MdaAlert', mdaAlertSchema);
