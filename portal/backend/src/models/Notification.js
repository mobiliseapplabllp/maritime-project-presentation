const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body: { type: String, default: '' },
  severity: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
  link: { type: String, default: '' },          // frontend route
  audiencePerm: { type: String, default: 'dashboard.view' }, // users holding this perm see it
  readBy: { type: [String], default: [] },      // user ids
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
