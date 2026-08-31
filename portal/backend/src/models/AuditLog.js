const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema({
  actor: { id: String, name: String, email: String },
  action: { type: String, required: true },   // CREATE / UPDATE / DELETE / TRANSITION / LOGIN / ISSUE / PAY / CLOSE ...
  entity: { type: String, required: true },   // Vessel, PortCall, ...
  entityId: { type: String, default: '' },
  entityLabel: { type: String, default: '' },
  before: { type: mongoose.Schema.Types.Mixed },
  after: { type: mongoose.Schema.Types.Mixed },
  ip: { type: String, default: '' },
  at: { type: Date, default: Date.now },
});

module.exports = mongoose.model('AuditLog', auditSchema);
