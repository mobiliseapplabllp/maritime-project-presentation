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
const seafarers = require('../controllers/seafarerController');
const legislation = require('../controllers/legislationController');
const licenses = require('../controllers/licenseController');
const incidents = require('../controllers/incidentController');
const tracking = require('../controllers/trackingController');
const risk = require('../controllers/riskController');
const ai = require('../controllers/aiController');
const stats = require('../controllers/statsController');
const reports = require('../controllers/reportController');
const cards = require('../controllers/cardController');
const companies = require('../controllers/companyController');
const services = require('../controllers/serviceController');
const agents = require('../controllers/agentController');
const reportLib = require('../controllers/reportLibraryController');
const settingsCtl = require('../controllers/settingsController');
const opsx = require('../controllers/opsController');
const search = require('../controllers/searchController');
const docs = require('../controllers/docsController');
const registrations = require('../controllers/vesselRegistrationController');

// express 4 doesn't catch async rejections — wrap every handler
const w = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const r = Router();

// public
r.get('/health', w(misc.health));
r.post('/auth/login', w(auth.login));
r.post('/auth/refresh', w(auth.refresh));
r.get('/public/verify/:licenseNo', w(licenses.publicVerify));
r.get('/public/signing-key', w(licenses.signingKey));
r.get('/public/registry/:officialNumber', w(registrations.publicRegistry));
r.get('/openapi.json', docs.spec);
r.get('/docs', docs.page);
r.get('/docs/stats', docs.stats);
r.get('/jurisdiction', w(docs.jurisdiction));

// everything below requires a session
r.use(authenticate);
r.get('/auth/me', w(auth.me));
r.get('/search', w(search.global));
r.post('/auth/change-password', w(auth.changePassword));
r.get('/meta', w(misc.meta));

r.get('/dashboard', requirePerm('dashboard.view'), w(dashboard.summary));

// registry
r.get('/vessels', requirePerm('vessels.view'), w(vessels.list));
r.post('/vessels', requirePerm('vessels.create'), w(vessels.create));
r.get('/vessels/certificates/all', requirePerm('certificates.view'), w(vessels.allCertificates));
r.get('/vessels/fleet-dashboard', requirePerm('vessels.view'), w(vessels.fleetDashboard));
r.get('/vessels/survey-planner', requirePerm('vessels.view'), w(vessels.surveyPlanner));
r.get('/vessels/:id/instruments', requirePerm('vessels.view'), w(licenses.forSubject('VESSEL')));
r.get('/vessels/:id/registrations', requirePerm('vessels.view'), w(registrations.forVessel));
r.get('/vessels/:id/transcript', requirePerm('vessels.view'), w(registrations.transcript));
r.get('/vessels/:id/voyages', requirePerm('vessels.view'), w(vessels.voyages));
r.get('/vessels/:id/movements', requirePerm('vessels.view'), w(vessels.movements));
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
r.get('/inspections/dashboard', requirePerm('inspections.view'), w(inspections.dashboard));
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
// history readings on the masters — registered before the generic /:id routes
r.get('/berths/downtime', requirePerm('masters.view'), w(masters.berthDowntime));
r.get('/berths/:id/outages', requirePerm('masters.view'), w(masters.berthOutages));
r.get('/tariffs/:id/history', requirePerm('tariffs.view'), w(masters.tariffHistory));

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

// seafarers
r.get('/seafarers/dashboard', requirePerm('seafarers.view'), w(seafarers.dashboard));
r.get('/seafarers', requirePerm('seafarers.view'), w(seafarers.list));
r.post('/seafarers', requirePerm('seafarers.create'), w(seafarers.create));
r.get('/seafarers/:id', requirePerm('seafarers.view'), w(seafarers.get));
r.put('/seafarers/:id', requirePerm('seafarers.edit'), w(seafarers.update));
r.delete('/seafarers/:id', requirePerm('seafarers.delete'), w(seafarers.remove));
r.post('/seafarers/:id/certificates', requirePerm('seafarers.edit'), w(seafarers.addCert));
r.put('/seafarers/:id/certificates/:certId', requirePerm('seafarers.edit'), w(seafarers.updateCert));
r.delete('/seafarers/:id/certificates/:certId', requirePerm('seafarers.edit'), w(seafarers.removeCert));
r.post('/seafarers/:id/service', requirePerm('seafarers.edit'), w(seafarers.addService));
r.post('/seafarers/:id/sign-on', requirePerm('seafarers.edit'), w(seafarers.signOn));
r.post('/seafarers/:id/sign-off', requirePerm('seafarers.edit'), w(seafarers.signOff));
r.delete('/seafarers/:id/service/:serviceId', requirePerm('seafarers.edit'), w(seafarers.removeService));

// legislation & circulars
r.get('/instruments', requirePerm('legislation.view'), w(legislation.list));
r.post('/instruments', requirePerm('legislation.manage'), w(legislation.create));
r.get('/instruments/:id', requirePerm('legislation.view'), w(legislation.get));
r.put('/instruments/:id', requirePerm('legislation.manage'), w(legislation.update));
r.delete('/instruments/:id', requirePerm('legislation.manage'), w(legislation.remove));
r.post('/instruments/:id/publish', requirePerm('legislation.approve'), w(legislation.publish));
r.post('/instruments/:id/acknowledge', requirePerm('legislation.view'), w(legislation.acknowledge));

// facilities & companies
r.get('/licenses', requirePerm('facilities.view'), w(licenses.list));
r.post('/licenses', requirePerm('facilities.manage'), w(licenses.create));
r.get('/licenses/:id', requirePerm('facilities.view'), w(licenses.get));
r.put('/licenses/:id', requirePerm('facilities.manage'), w(licenses.update));
r.delete('/licenses/:id', requirePerm('facilities.manage'), w(licenses.remove));
r.get('/licenses/:id/checks', requirePerm('facilities.view'), w(licenses.checks));
r.post('/licenses/:id/transition', requirePerm('facilities.approve'), w(licenses.transition));
r.post('/licenses/:id/audits', requirePerm('facilities.manage'), w(licenses.addAudit));
r.get('/licenses/:id/endorsements', requirePerm('certificates.view'), w(licenses.endorsements));
r.post('/licenses/:id/endorsements', requirePerm('certificates.manage'), w(licenses.endorse));

// ship registration — the Registrar of Indian Ships (Merchant Shipping Act 1958, Part V)
r.get('/registrations/reference', requirePerm('registry.view'), w(registrations.reference));
r.get('/registrations/dashboard', requirePerm('registry.view'), w(registrations.dashboard));
r.get('/registrations', requirePerm('registry.view'), w(registrations.list));
r.post('/registrations', requirePerm('registry.apply'), w(registrations.apply));
r.get('/registrations/:id', requirePerm('registry.view'), w(registrations.get));
r.put('/registrations/:id', requirePerm('registry.apply'), w(registrations.update));
r.get('/registrations/:id/checks', requirePerm('registry.assess'), w(registrations.checks));
r.post('/registrations/:id/transition', requirePerm('registry.assess'), w(registrations.transition));
r.post('/registrations/:id/carving-compliance', requirePerm('registry.assess'), w(registrations.carvingCompliance));
r.post('/registrations/:id/grant', requirePerm('registry.grant'), w(registrations.grant));
r.post('/registrations/:id/evidence', requirePerm('registry.apply'), w(registrations.addEvidence));
r.put('/registrations/:id/evidence/:evidenceId', requirePerm('registry.assess'), w(registrations.verifyEvidence));
r.post('/registrations/:id/encumbrances', requirePerm('registry.assess'), w(registrations.addEncumbrance));
r.put('/registrations/:id/encumbrances/:encumbranceId', requirePerm('registry.assess'), w(registrations.dischargeEncumbrance));

// incident management — case files with lifecycle, comms, documents, tasks
r.get('/incidents/dashboard', requirePerm('incidents.view'), w(incidents.dashboard));
r.get('/incidents/risk-matrix', requirePerm('incidents.view'), w(incidents.riskMatrix));
r.get('/incidents', requirePerm('incidents.view'), w(incidents.list));
r.post('/incidents', requirePerm('incidents.create'), w(incidents.create));
r.get('/incidents/:id', requirePerm('incidents.view'), w(incidents.get));
r.put('/incidents/:id', requirePerm('incidents.manage'), w(incidents.update));
r.delete('/incidents/:id', requirePerm('incidents.manage'), w(incidents.remove));
r.post('/incidents/:id/transition', requirePerm('incidents.manage'), w(incidents.transition));
r.post('/incidents/:id/comms', requirePerm('incidents.manage'), w(incidents.addComm));
r.post('/incidents/:id/documents', requirePerm('incidents.manage'), w(incidents.addDocument));
r.post('/incidents/:id/tasks', requirePerm('incidents.manage'), w(incidents.addTask));
r.put('/incidents/:id/tasks/:taskId', requirePerm('incidents.manage'), w(incidents.setTask));
r.post('/incidents/:id/log', requirePerm('incidents.manage'), w(incidents.addLog));

// maritime surveillance — traffic picture + MDA alerts
r.get('/tracking', requirePerm('nmc.view'), w(tracking.picture));
r.post('/tracking/alerts/:id/ack', requirePerm('nmc.manage'), w(tracking.ackAlert));

// harbour operations depth — quay twin, day schedule, marine resources
r.get('/ops/twin', requirePerm('portcalls.view'), w(opsx.twin));
r.get('/ops/schedule', requirePerm('portcalls.view'), w(opsx.schedule));
r.get('/ops/resources', requirePerm('portcalls.view'), w(opsx.resources));
r.get('/ops/resources/utilisation', requirePerm('portcalls.view'), w(opsx.resourceUtilisation));
r.get('/ops/resources/:id/history', requirePerm('portcalls.view'), w(opsx.resourceHistory));
r.get('/ops/berth-plan', requirePerm('portcalls.view'), w(opsx.berthPlan));
r.get('/port-calls/:id/sof', requirePerm('portcalls.view'), w(opsx.sof));
r.post('/port-calls/:id/pda', requirePerm('invoices.create'), w(opsx.generatePda));
r.get('/port-calls/:id/pda', requirePerm('invoices.view'), w(opsx.pdaVariance));
r.put('/ops/resources/:id', requirePerm('portcalls.edit'), w(opsx.setResourceStatus));

// A2 — service catalogue and requests: the one front door for every service
r.get('/services/catalogue', requirePerm('services.view'), w(services.catalogue));
r.get('/services/dashboard', requirePerm('services.view'), w(services.dashboard));
r.get('/services/definitions', requirePerm('services.view'), w(services.listDefinitions));
r.post('/services/definitions', requirePerm('services.manage'), w(services.upsertDefinition));
r.get('/services/definitions/:id', requirePerm('services.view'), w(services.getDefinition));
r.get('/services/requests', requirePerm('services.view'), w(services.list));
r.post('/services/requests', requirePerm('services.apply'), w(services.submit));
r.get('/services/requests/:id', requirePerm('services.view'), w(services.get));
r.post('/services/requests/:id/transition', requirePerm('services.assess'), w(services.transition));
r.post('/services/requests/:id/issue', requirePerm('services.approve'), w(services.issue));
r.post('/services/requests/:id/documents', requirePerm('services.apply'), w(services.addDocument));
r.put('/services/requests/:id/documents/:docId', requirePerm('services.assess'), w(services.verifyDocument));

// A3 — agent autonomy, the AI decision register and the human review queue
r.get('/agents', requirePerm('agents.view'), w(agents.list));
r.get('/agents/dashboard', requirePerm('agents.view'), w(agents.dashboard));
r.get('/agents/decisions', requirePerm('agents.view'), w(agents.listDecisions));
r.post('/agents/decisions/:id/review', requirePerm('agents.review'), w(agents.review));
r.get('/agents/:agentId', requirePerm('agents.view'), w(agents.get));
r.put('/agents/:agentId', requirePerm('agents.configure'), w(agents.configure));
r.post('/agents/:agentId/suspend', requirePerm('agents.configure'), w(agents.suspend));
r.post('/agents/:agentId/run', requirePerm('agents.configure'), w(agents.run));

// port companies directory
r.get('/companies', requirePerm('facilities.view'), w(companies.list));
r.post('/companies', requirePerm('facilities.manage'), w(companies.create));
r.get('/companies/:id', requirePerm('facilities.view'), w(companies.get));
r.put('/companies/:id', requirePerm('facilities.manage'), w(companies.update));
r.delete('/companies/:id', requirePerm('facilities.manage'), w(companies.remove));

// entity hover-cards (any signed-in user)
r.get('/cards/:type/:id', w(cards.get));

// compliance & risk engine
r.get('/risk/scores', requirePerm('risk.view'), w(risk.scores));
r.get('/risk/targeting', requirePerm('risk.view'), w(risk.targeting));
r.get('/risk/weights', requirePerm('risk.view'), w(risk.getWeights));
r.put('/risk/weights', requirePerm('risk.manage'), w(risk.updateWeights));

// per-module stat cards (permission checked per scope inside a tiny gate)
r.get('/stats/:scope', (req, _res, next) => {
  const sc = stats.SCOPES[req.params.scope];
  if (!sc) return next();
  return requirePerm(sc.perm)(req, _res, next);
}, w(stats.get));

// MIS reports + report library
r.get('/reports/mis', requirePerm('reports.view'), w(reports.mis));
r.get('/reports/catalog', requirePerm('reports.view'), w(reportLib.catalog));
r.get('/reports/run/:key', requirePerm('reports.view'), w(reportLib.run));

// AI assistant
r.post('/ai/chat', requirePerm('ai.use'), w(ai.chat));
r.get('/ai/suggestions', requirePerm('ai.use'), w(ai.suggestions));

r.get('/notifications', w(misc.notifications));
r.post('/notifications/:id/read', w(misc.markRead));
r.post('/notifications/read-all', w(misc.markAllRead));

r.get('/settings', requirePerm('settings.view'), w(settingsCtl.getAll));
r.put('/settings/:section', requirePerm('settings.manage'), w(settingsCtl.updateSection));
r.post('/settings/smtp/test', requirePerm('settings.manage'), w(settingsCtl.smtpTest));
r.get('/module-settings/:key', w(settingsCtl.getModule));
r.put('/module-settings/:key', requirePerm('settings.manage'), w(settingsCtl.updateModule));

module.exports = r;
