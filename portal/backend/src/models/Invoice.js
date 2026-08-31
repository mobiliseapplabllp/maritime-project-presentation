const mongoose = require('mongoose');
const { INVOICE_STATUS } = require('../config/constants');

const invoiceSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true },  // MUN/INV/2026/0087
  portCall: { type: mongoose.Schema.Types.ObjectId, ref: 'PortCall', required: true },
  vessel: { type: mongoose.Schema.Types.ObjectId, ref: 'Vessel', required: true },
  billTo: { name: String, address: String, gstin: String },
  lines: [{ code: String, description: String, unit: String, qty: Number, rate: Number, amount: Number }],
  subtotal: { type: Number, required: true },
  gstRate: { type: Number, required: true },
  gstAmount: { type: Number, required: true },
  total: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: INVOICE_STATUS, default: 'DRAFT' },
  issuedAt: Date,
  paidAt: Date,
  paymentRef: { type: String, default: '' },
  notes: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
