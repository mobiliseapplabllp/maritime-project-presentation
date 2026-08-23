/* Exports the seeded database + computed dashboard into the frontend demo snapshot. */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const M = require('../src/models');
const dashboard = require('../src/controllers/dashboardController');
const C = require('../src/config/constants');

async function run() {
  await connectDB();
  const [vessels, berths, lookups, tariffs, templates, users, roles, portcalls, inspections, invoices, notifications, settings, audit] = await Promise.all([
    M.Vessel.find().lean(), M.Berth.find().lean(), M.Lookup.find().lean(), M.TariffItem.find().lean(),
    M.ChecklistTemplate.find().lean(),
    M.User.find().select('-passwordHash').lean(), M.Role.find().lean(),
    M.PortCall.find().lean(), M.Inspection.find().lean(), M.Invoice.find().lean(),
    M.Notification.find().lean(), M.Setting.findOne({ key: 'org' }).lean(),
    M.AuditLog.find().sort({ at: -1 }).limit(60).lean(),
  ]);
  let dash;
  await dashboard.summary({}, { json: (p) => { dash = p; } });
  const out = {
    generatedAt: new Date().toISOString(),
    org: (settings && settings.value) || {},
    meta: {
      permissionGroups: C.PERMISSION_GROUPS, portCallStatuses: C.PORTCALL_STATUS,
      portCallTransitions: C.PORTCALL_TRANSITIONS, inspectionTypes: C.INSPECTION_TYPES,
      inspectionResults: C.INSPECTION_RESULTS, invoiceStatuses: C.INVOICE_STATUS,
      lookupCategories: C.LOOKUP_CATEGORIES, gstRate: C.GST_RATE,
    },
    dashboard: dash.data,
    collections: { vessels, berths, lookups, tariffs, templates, users, roles, portcalls, inspections, invoices, notifications, audit },
  };
  const dest = path.join(__dirname, '..', '..', 'frontend', 'src', 'demo', 'snapshot.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log('exported', dest, Math.round(fs.statSync(dest).size / 1024) + 'KB',
    JSON.stringify({ portcalls: portcalls.length, invoices: invoices.length, audit: audit.length }));
  await mongoose.disconnect();
}
run().catch((e) => { console.error(e); process.exit(1); });
