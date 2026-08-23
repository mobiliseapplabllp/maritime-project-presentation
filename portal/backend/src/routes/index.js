const { Router } = require('express');
const { authenticate, requirePerm } = require('../middleware/auth');

const auth = require('../controllers/authController');
const users = require('../controllers/userController');
const roles = require('../controllers/roleController');
const masters = require('../controllers/masterController');
const vessels = require('../controllers/vesselController');
const portCalls = require('../controllers/portCallController');
const inspections = require('../controllers/inspectionController');
const invoices = require('../controllers/invoiceController');
const dashboard = require('../controllers/dashboardController');
const misc = require('../controllers/miscController');

// express 4 doesn't catch async rejections — wrap every handler
const w = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const r = Router();

// public
r.get('/health', w(misc.health));
r.post('/auth/login', w(auth.login));
r.post('/auth/refresh', w(auth.refresh));

// everything below requires a session
r.use(authenticate);
r.get('/auth/me', w(auth.me));
r.post('/auth/change-password', w(auth.changePassword));
r.get('/meta', w(misc.meta));

r.get('/dashboard', requirePerm('dashboard.view'), w(dashboard.summary));

// registry
r.get('/vessels', requirePerm('vessels.view'), w(vessels.list));
r.post('/vessels', requirePerm('vessels.create'), w(vessels.create));
r.get('/vessels/certificates/all', requirePerm('certificates.view'), w(vessels.allCertificates));
r.get('/vessels/:id', requirePerm('vessels.view'), w(vessels.get));
r.put('/vessels/:id', requirePerm('vessels.edit'), w(vessels.update));
r.delete('/vessels/:id', requirePerm('vessels.delete'), w(vessels.remove));
r.post('/vessels/:id/certificates', requirePerm('certificates.manage'), w(vessels.addCert));
r.put('/vessels/:id/certificates/:certId', requirePerm('certificates.manage'), w(vessels.updateCert));
r.delete('/vessels/:id/certificates/:certId', requirePerm('certificates.manage'), w(vessels.removeCert));

// port calls
r.get('/port-calls', requirePerm('portcalls.view'), w(portCalls.list));
r.post('/port-calls', requirePerm('portcalls.create'), w(portCalls.create));
r.get('/port-calls/:id', requirePerm('portcalls.view'), w(portCalls.get));
r.put('/port-calls/:id', requirePerm('portcalls.edit'), w(portCalls.update));
r.delete('/port-calls/:id', requirePerm('portcalls.delete'), w(portCalls.remove));
r.post('/port-calls/:id/transition', requirePerm('portcalls.transition'), w(portCalls.transition));
r.post('/port-calls/:id/services', requirePerm('portcalls.edit'), w(portCalls.addService));
r.delete('/port-calls/:id/services/:serviceId', requirePerm('portcalls.edit'), w(portCalls.removeService));
r.post('/port-calls/:id/cargo', requirePerm('cargo.manage'), w(portCalls.addCargoOp));
r.put('/port-calls/:id/cargo/:opId', requirePerm('cargo.manage'), w(portCalls.updateCargoOp));
r.delete('/port-calls/:id/cargo/:opId', requirePerm('cargo.manage'), w(portCalls.removeCargoOp));

// inspections
r.get('/inspections', requirePerm('inspections.view'), w(inspections.list));
r.post('/inspections', requirePerm('inspections.create'), w(inspections.create));
r.get('/inspections/:id', requirePerm('inspections.view'), w(inspections.get));
r.put('/inspections/:id', requirePerm('inspections.edit'), w(inspections.update));
r.delete('/inspections/:id', requirePerm('inspections.delete'), w(inspections.remove));
r.post('/inspections/:id/start', requirePerm('inspections.edit'), w(inspections.start));
r.post('/inspections/:id/close', requirePerm('inspections.close'), w(inspections.close));
r.post('/inspections/:id/findings', requirePerm('inspections.edit'), w(inspections.addFinding));
r.put('/inspections/:id/findings/:findingId', requirePerm('inspections.edit'), w(inspections.updateFinding));
r.delete('/inspections/:id/findings/:findingId', requirePerm('inspections.edit'), w(inspections.removeFinding));

// invoices
r.get('/invoices', requirePerm('invoices.view'), w(invoices.list));
r.post('/invoices/generate', requirePerm('invoices.create'), w(invoices.generate));
r.get('/invoices/:id', requirePerm('invoices.view'), w(invoices.get));
r.put('/invoices/:id', requirePerm('invoices.create'), w(invoices.update));
r.post('/invoices/:id/issue', requirePerm('invoices.issue'), w(invoices.issue));
r.post('/invoices/:id/pay', requirePerm('invoices.pay'), w(invoices.pay));
r.post('/invoices/:id/cancel', requirePerm('invoices.issue'), w(invoices.cancel));
r.delete('/invoices/:id', requirePerm('invoices.delete'), w(invoices.remove));

// masters
const master = (path, ctrl, viewPerm, managePerm) => {
  r.get(`/${path}`, requirePerm(viewPerm), w(ctrl.list));
  r.post(`/${path}`, requirePerm(managePerm), w(ctrl.create));
  r.get(`/${path}/:id`, requirePerm(viewPerm), w(ctrl.get));
  r.put(`/${path}/:id`, requirePerm(managePerm), w(ctrl.update));
  r.delete(`/${path}/:id`, requirePerm(managePerm), w(ctrl.remove));
};
master('berths', masters.berths, 'masters.view', 'masters.manage');
master('lookups', masters.lookups, 'masters.view', 'masters.manage');
master('checklist-templates', masters.checklists, 'masters.view', 'masters.manage');
master('tariffs', masters.tariffs, 'tariffs.view', 'tariffs.manage');

// admin
r.get('/users', requirePerm('users.view'), w(users.list));
r.post('/users', requirePerm('users.manage'), w(users.create));
r.put('/users/:id', requirePerm('users.manage'), w(users.update));
r.post('/users/:id/reset-password', requirePerm('users.manage'), w(users.resetPassword));
r.delete('/users/:id', requirePerm('users.manage'), w(users.remove));

r.get('/roles', requirePerm('roles.view'), w(roles.list));
r.post('/roles', requirePerm('roles.manage'), w(roles.create));
r.put('/roles/:id', requirePerm('roles.manage'), w(roles.update));
r.delete('/roles/:id', requirePerm('roles.manage'), w(roles.remove));

r.get('/audit', requirePerm('audit.view'), w(misc.auditList));

r.get('/notifications', w(misc.notifications));
r.post('/notifications/:id/read', w(misc.markRead));
r.post('/notifications/read-all', w(misc.markAllRead));

r.get('/settings', requirePerm('settings.view'), w(misc.getSettings));
r.put('/settings', requirePerm('settings.manage'), w(misc.updateSettings));

module.exports = r;
