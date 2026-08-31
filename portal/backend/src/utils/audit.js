const AuditLog = require('../models/AuditLog');

const clean = (doc) => {
  if (!doc) return undefined;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  delete o.passwordHash;
  delete o.__v;
  return o;
};

// Fire-and-forget audit write; an audit failure must never fail the request.
function audit(req, { action, entity, entityId, entityLabel, before, after }) {
  const actor = req.user
    ? { id: String(req.user.id), name: req.user.name, email: req.user.email }
    : { id: '', name: 'system', email: '' };
  AuditLog.create({
    actor, action, entity,
    entityId: entityId ? String(entityId) : '',
    entityLabel: entityLabel || '',
    before: clean(before), after: clean(after),
    ip: req.ip || '',
  }).catch((e) => console.error('audit write failed:', e.message));
}

module.exports = { audit };
