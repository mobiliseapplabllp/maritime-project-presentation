const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', required: true },
  designation: { type: String, default: '' },
  phone: { type: String, default: '' },
  active: { type: Boolean, default: true },
  lastLoginAt: Date,
}, { timestamps: true });

userSchema.methods.toSafe = function () {
  const { _id, name, email, role, designation, phone, active, lastLoginAt, createdAt } = this;
  return { _id, name, email, role, designation, phone, active, lastLoginAt, createdAt };
};

module.exports = mongoose.model('User', userSchema);
