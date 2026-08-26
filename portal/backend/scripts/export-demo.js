/* Exports the seeded database + computed dashboard into the frontend demo snapshot. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const M = require('../src/models');
const dashboard = require('../src/controllers/dashboardController');
const risk = require('../src/controllers/riskController');
const tracking = require('../src/controllers/trackingController');
const C = require('../src/config/constants');
const SC = require('../src/domain/statutoryCertificates');
const registryCtl = require('../src/controllers/vesselRegistrationController');
const servicesCtl = require('../src/controllers/serviceController');
const agentsCtl = require('../src/controllers/agentController');
const Sign = require('../src/domain/certificateSigning');
const REG = require('../src/domain/vesselRegistry');

async function run() {
  await connectDB();
  const [vessels, berths, lookups, tariffs, templates, users, roles, portcalls, inspections, invoices, notifications, settings, audit, seafarers, instruments, licenses, incidents, resources, companies,
    registrations, serviceDefinitions, serviceRequests, agentConfigs, aiDecisions] = await Promise.all([
    M.Vessel.find().lean(), M.Berth.find().lean(), M.Lookup.find().lean(), M.TariffItem.find().lean(),
    M.ChecklistTemplate.find().lean(),
    M.User.find().select('-passwordHash').lean(), M.Role.find().lean(),
    M.PortCall.find().lean(), M.Inspection.find().lean(), M.Invoice.find().lean(),
    M.Notification.find().lean(), M.Setting.findOne({ key: 'org' }).lean(),
    M.AuditLog.find().sort({ at: -1 }).limit(2500).lean(),
    M.Seafarer.find().lean(), M.Instrument.find().lean(), M.License.find().lean(), M.Incident.find().lean(), M.Resource.find().lean(), M.Company.find().lean(),
    M.VesselRegistration.find().lean(), M.ServiceDefinition.find().lean(), M.ServiceRequest.find().lean(),
    M.AgentConfig.find().lean(), M.AiDecision.find().sort({ at: -1 }).limit(400).lean(),
  ]);
  const [auditTotal, auditOldest] = await Promise.all([
    M.AuditLog.countDocuments(),
    M.AuditLog.find().sort({ at: 1 }).limit(1).select('at').lean(),
  ]);
  const auditAll = await M.AuditLog.find().select('entity').lean();
  const auditByEntity = {};
  auditAll.forEach((r) => { auditByEntity[r.entity] = (auditByEntity[r.entity] || 0) + 1; });

  let dash; let riskScores; let riskTargeting; let riskWeights; let trafficPic;
  await dashboard.summary({}, { json: (p) => { dash = p; } });
  await risk.scores({}, { json: (p) => { riskScores = p; } });
  await risk.targeting({}, { json: (p) => { riskTargeting = p; } });
  await risk.getWeights({}, { json: (p) => { riskWeights = p; } });
  await tracking.picture({}, { json: (p) => { trafficPic = p; } });
  // the registry's form reference data and desk dashboard, computed once here so
  // the demo client answers those two endpoints from the snapshot exactly as the
  // live service answers them
  let registryReference; let registryDashboard;
  registryCtl.reference({}, { json: (p) => { registryReference = p.data; } });
  await registryCtl.dashboard({}, { json: (p) => { registryDashboard = p.data; } });
  registryReference = { ...registryReference, dashboard: registryDashboard };

  /* The demo client serves a frozen snapshot, so anything the live service
   * derives at read time is derived here instead of being reimplemented in the
   * browser. Duplicating the survey-regime and signature rules on the client
   * would mean two copies of the only logic that decides whether a certificate
   * is valid, and they would drift. */
  const now = new Date();
  licenses.forEach((l) => {
    const force = SC.forceState(l, now);
    l.statutory = SC.isStatutory(l.entityType);
    l.nonExpiring = SC.nonExpiring(l.entityType);
    l.certificateName = SC.CERT_LABEL[l.entityType] || '';
    l.convention = SC.CONVENTION[l.entityType] || '';
    l.inForce = force.inForce;
    l.forceReason = force.reason;
    l.endorsementState = force.endorsements || (l.statutory ? SC.endorsementState(l, now) : null);
    l.signatureVerification = Sign.verify(l);
  });
  registrations.forEach((r) => {
    r.portOfRegistryName = r.portOfRegistryName || REG.portName(r.portOfRegistry);
    r.slaBreached = !!(r.dueAt && !r.closedAt && new Date(r.dueAt) < now);
    r.requiredEvidence = REG.requiredEvidence(r);
    r.shareLedger = REG.shareLedger(r.owners);
  });
  // one transcript per ship that has ever been on the register
  const transcripts = {};
  for (const v of vessels.filter((x) => x.registry && x.registry.state && x.registry.state !== 'UNREGISTERED')) {
    // eslint-disable-next-line no-await-in-loop
    await registryCtl.transcript({ params: { id: String(v._id) } }, { json: (pp) => { transcripts[String(v._id)] = pp.data; } });
  }
  registryReference = { ...registryReference, transcripts, signingKey: Sign.publicKey() };

  // the same treatment for the service desk and the agent register: whatever the
  // live service computes on read is computed once here
  let serviceCatalogue; let serviceDash; let agentDash;
  await servicesCtl.catalogue({}, { json: (pp) => { serviceCatalogue = pp.data; } });
  await servicesCtl.dashboard({}, { json: (pp) => { serviceDash = pp.data; } });
  await agentsCtl.dashboard({}, { json: (pp) => { agentDash = pp.data; } });
  serviceRequests.forEach((r) => {
    r.slaBreached = !!(r.dueAt && !r.closedAt && new Date(r.dueAt) < now);
  });
  const out = {
    generatedAt: new Date().toISOString(),
    org: (settings && settings.value) || {},
    meta: {
      permissionGroups: C.PERMISSION_GROUPS, portCallStatuses: C.PORTCALL_STATUS,
      portCallTransitions: C.PORTCALL_TRANSITIONS, inspectionTypes: C.INSPECTION_TYPES,
      inspectionResults: C.INSPECTION_RESULTS, invoiceStatuses: C.INVOICE_STATUS,
      lookupCategories: C.LOOKUP_CATEGORIES, gstRate: C.GST_RATE,
      incidentTypes: C.INCIDENT_TYPES, incidentStatus: C.INCIDENT_STATUS, incidentSeverity: C.INCIDENT_SEVERITY,
      incidentCategories: C.INCIDENT_CATEGORIES, incidentPriorities: C.INCIDENT_PRIORITIES, incidentSources: C.INCIDENT_SOURCES,
      incidentTransitions: C.INCIDENT_TRANSITIONS, resourceTypes: C.RESOURCE_TYPES,
      // B1/B2 — the register's own vocabulary, so the demo client can render the
      // same lifecycle and the same statutory reference data as the live service
      registrationKinds: C.REGISTRATION_KINDS, registrationStatus: C.REGISTRATION_STATUS,
      registrationTransitions: C.REGISTRATION_TRANSITIONS, registryStates: C.REGISTRY_STATES,
      deletionReasons: C.DELETION_REASONS, amendmentTypes: C.AMENDMENT_TYPES,
      requestStatus: C.REQUEST_STATUS, requestTransitions: C.REQUEST_TRANSITIONS,
      certLabels: SC.CERT_LABEL, certConventions: SC.CONVENTION, surveyRegimes: SC.SURVEY_REGIME,
      statutoryTypes: SC.STATUTORY_TYPES,
      // audit is exported as the newest slice only — these describe the whole register
      auditTotal, auditFirstAt: auditOldest[0] ? auditOldest[0].at : null, auditByEntity,
    },
    dashboard: dash.data,
    risk: { scores: riskScores.data, weights: riskWeights.data, targeting: riskTargeting.data },
    tracking: trafficPic.data,
    registry: registryReference,
    services: { catalogue: serviceCatalogue, dashboard: serviceDash },
    agents: { dashboard: agentDash },
    collections: {
      vessels, berths, lookups, tariffs, templates, users, roles, portcalls, inspections, invoices,
      notifications, audit, seafarers, instruments, licenses, incidents, resources, companies,
      registrations, serviceDefinitions, serviceRequests, agentConfigs, aiDecisions,
    },
  };
  const dest = path.join(__dirname, '..', '..', 'frontend', 'src', 'demo', 'snapshot.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log('exported', dest, Math.round(fs.statSync(dest).size / 1024) + 'KB',
    JSON.stringify({ portcalls: portcalls.length, invoices: invoices.length,
      audit: `${audit.length}/${auditTotal}`, craftJobs: resources.reduce((s2, r) => s2 + (r.jobs || []).length, 0) }));
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
