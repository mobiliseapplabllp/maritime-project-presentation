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

async function run() {
  await connectDB();
  const [vessels, berths, lookups, tariffs, templates, users, roles, portcalls, inspections, invoices, notifications, settings, audit, seafarers, instruments, licenses, incidents, resources, companies] = await Promise.all([
    M.Vessel.find().lean(), M.Berth.find().lean(), M.Lookup.find().lean(), M.TariffItem.find().lean(),
    M.ChecklistTemplate.find().lean(),
    M.User.find().select('-passwordHash').lean(), M.Role.find().lean(),
    M.PortCall.find().lean(), M.Inspection.find().lean(), M.Invoice.find().lean(),
    M.Notification.find().lean(), M.Setting.findOne({ key: 'org' }).lean(),
    M.AuditLog.find().sort({ at: -1 }).limit(2500).lean(),
    M.Seafarer.find().lean(), M.Instrument.find().lean(), M.License.find().lean(), M.Incident.find().lean(), M.Resource.find().lean(), M.Company.find().lean(),
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
      // audit is exported as the newest slice only — these describe the whole register
      auditTotal, auditFirstAt: auditOldest[0] ? auditOldest[0].at : null, auditByEntity,
    },
    dashboard: dash.data,
    risk: { scores: riskScores.data, weights: riskWeights.data, targeting: riskTargeting.data },
    tracking: trafficPic.data,
    collections: { vessels, berths, lookups, tariffs, templates, users, roles, portcalls, inspections, invoices, notifications, audit, seafarers, instruments, licenses, incidents, resources, companies },
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
