class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const ok = (res, data, meta) => res.json({ success: true, data, ...(meta ? { meta } : {}) });
const created = (res, data) => res.status(201).json({ success: true, data });

module.exports = { ApiError, ok, created };
