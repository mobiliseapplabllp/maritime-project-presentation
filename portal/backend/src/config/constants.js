// Single source of truth for permissions, statuses and workflow rules.
// Consumed by backend middleware, the seeder, tests, and (via /api/meta) the frontend.

const PERMISSION_GROUPS = [
  { module: 'dashboard',    label: 'Dashboard',            actions: ['view'] },
  { module: 'vessels',      label: 'Vessel Registry',      actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'certificates', label: 'Certificates',         actions: ['view', 'manage'] },
  { module: 'portcalls',    label: 'Port Calls',           actions: ['view', 'create', 'edit', 'delete', 'transition'] },
  { module: 'cargo',        label: 'Cargo Operations',     actions: ['manage'] },
  { module: 'inspections',  label: 'Inspections',          actions: ['view', 'create', 'edit', 'close', 'delete'] },
  { module: 'invoices',     label: 'Invoices',             actions: ['view', 'create', 'issue', 'pay', 'delete'] },
  { module: 'tariffs',      label: 'Tariff Master',        actions: ['view', 'manage'] },
  { module: 'masters',      label: 'Masters',              actions: ['view', 'manage'] },
  { module: 'users',        label: 'Users',                actions: ['view', 'manage'] },
  { module: 'roles',        label: 'Roles & Permissions',  actions: ['view', 'manage'] },
  { module: 'audit',        label: 'Audit Log',            actions: ['view'] },
  { module: 'settings',     label: 'Settings',             actions: ['view', 'manage'] },
  { module: 'seafarers',    label: 'Seafarers',            actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'legislation',  label: 'Notices & Circulars',     actions: ['view', 'manage'] },
  { module: 'facilities',   label: 'Port Companies',          actions: ['view', 'manage', 'approve'] },
  { module: 'nmc',          label: 'Maritime Surveillance',   actions: ['view', 'manage'] },
  { module: 'incidents',    label: 'Incident Management',     actions: ['view', 'create', 'manage', 'close'] },
  { module: 'risk',         label: 'Risk Intelligence',       actions: ['view', 'manage'] },
  { module: 'ai',           label: 'AI Assistant',            actions: ['use'] },
  { module: 'reports',      label: 'MIS Reports',             actions: ['view'] },
];

const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.actions.map((a) => `${g.module}.${a}`));

const PORTCALL_STATUS = ['ANNOUNCED', 'CONFIRMED', 'AT_ANCHORAGE', 'BERTHED', 'SAILED', 'CANCELLED'];

// from -> allowed next states
const PORTCALL_TRANSITIONS = {
  ANNOUNCED:    ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:    ['AT_ANCHORAGE', 'BERTHED', 'CANCELLED'],
  AT_ANCHORAGE: ['BERTHED', 'CANCELLED'],
  BERTHED:      ['SAILED'],
  SAILED:       [],
  CANCELLED:    [],
};

const INSPECTION_TYPES = ['PSC', 'FSI', 'ISM', 'ISPS', 'MLC'];
const INSPECTION_STATUS = ['PLANNED', 'IN_PROGRESS', 'CLOSED'];
const INSPECTION_RESULTS = ['SATISFACTORY', 'DEFICIENCIES', 'DETAINED'];

const INVOICE_STATUS = ['DRAFT', 'ISSUED', 'PAID', 'CANCELLED'];
const GST_RATE = 18; // percent, applied as IGST on port services in this demo

const LOOKUP_CATEGORIES = [
  { key: 'vesselType',     label: 'Vessel Types' },
  { key: 'cargoType',      label: 'Cargo Types' },
  { key: 'port',           label: 'Ports (UN/LOCODE)' },
  { key: 'agent',          label: 'Shipping Agents' },
  { key: 'deficiencyCode', label: 'Deficiency Codes' },
  { key: 'actionCode',     label: 'PSC Action Codes' },
  { key: 'country',        label: 'Countries' },
  { key: 'state',          label: 'States' },
  { key: 'city',           label: 'Cities' },
  { key: 'uom',            label: 'Units of Measure' },
  { key: 'currency',       label: 'Currencies' },
  { key: 'equipmentType',  label: 'Equipment Types' },
  { key: 'equipment',      label: 'Equipment & Assets' },
  { key: 'department',     label: 'Departments' },
  { key: 'designation',    label: 'Designations' },
  { key: 'shift',          label: 'Shifts' },
  { key: 'documentType',   label: 'Document Types' },
  { key: 'incidentArea',   label: 'Incident Locations' },
  { key: 'holiday',        label: 'Holiday Calendar' },
];

// Per-module settings — defaults merged under Setting key `module:<key>`.
const MODULE_SETTING_DEFAULTS = {
  ops:       { vcnPrefix: 'MUN', anchorageAlertHrs: 24, defaultTugsUnder250m: 2, defaultTugsOver250m: 3, scheduleWindowDays: 5, channelSpeedLimitKn: 8, aisGapAlertMin: 30, anchorDriftNm: 0.2, zoneEntryWatch: true },
  ships:     { certExpiringDays: 30, dryDockReminderDays: 60, riskRefreshMinutes: 30 },
  crew:      { medicalExpiringDays: 45, minRestHours: 10, cocVerifyOnSignOn: true },
  legis:     { ackRequiredDefault: false, ackReminderDays: 7, showSupersededDays: 365 },
  incidents: { mttaTargetMin: 30, mttrTargetHrs: 24, autoNotifySeverity: 'HIGH', reopenWindowDays: 30, injuryReportHrs: 24 },
  inspect:   { findingDueDays: 14, detentionThreshold: 1, passScorePct: 80, requireEvidencePhotos: false },
  facil:     { licenceValidityYears: 2, auditIntervalMonths: 12, renewalReminderDays: 90 },
  finance:   { invoicePrefix: 'MUN/INV', paymentTermsDays: 30, overdueReminderDays: 7, roundTotalsToRupee: true },
  mis:       { defaultPeriodMonths: 12, exportFooter: 'Generated by Mundra Port Operations Portal' },
  masters:   { allowHardDelete: false },
  // auditRetentionDays must cover the full seeded history (Jan 2023 onward) — the
  // boot-time purge in server.js deletes anything older, so a shorter window
  // silently truncates the audit register on first start.
  admin:     { sessionTimeoutMin: 60, passwordMinLength: 8, auditRetentionDays: 1825 },
};

const CERT_EXPIRING_DAYS = 30;

const SEAFARER_RANKS = ['Master', 'Chief Officer', 'Second Officer', 'Third Officer', 'Chief Engineer',
  'Second Engineer', 'Third Engineer', 'Fourth Engineer', 'Electro-Technical Officer', 'Bosun', 'Able Seaman',
  'Ordinary Seaman', 'Oiler', 'Fitter', 'Cook', 'Steward', 'Deck Cadet', 'Engine Cadet'];
const SEAFARER_CERT_TYPES = ['Certificate of Competency', 'GMDSS GOC', 'Medical Fitness (ILO/MLC)',
  'STCW Basic Safety Training', 'Advanced Fire Fighting', 'Medical First Aid', 'Ship Security Officer',
  'Tanker Familiarisation', 'Certificate of Discharge (CDC)'];

const INSTRUMENT_TYPES = ['ACT', 'RULES', 'CIRCULAR', 'NOTICE', 'ORDER', 'CONVENTION'];
const INSTRUMENT_STATUS = ['DRAFT', 'IN_FORCE', 'SUPERSEDED', 'WITHDRAWN'];

const LICENSE_TYPES = ['SHIPPING_AGENCY', 'BUNKER_SUPPLIER', 'SHIP_CHANDLER', 'REPAIR_YARD', 'MANNING_AGENCY',
  'MARINE_SURVEYOR', 'TRAINING_INSTITUTE', 'PORT_FACILITY_ISPS', 'STEVEDORE', 'DIVING_CONTRACTOR'];
const LICENSE_STATUS = ['APPLIED', 'UNDER_REVIEW', 'ISSUED', 'REJECTED', 'SUSPENDED', 'REVOKED'];
const LICENSE_TRANSITIONS = {
  APPLIED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['ISSUED', 'REJECTED'],
  ISSUED: ['SUSPENDED', 'REVOKED'],
  SUSPENDED: ['ISSUED', 'REVOKED'],   // ISSUED here = reinstated
  REJECTED: [], REVOKED: [],
};

const INCIDENT_CATEGORIES = ['MARINE', 'HSE', 'SECURITY', 'ENVIRONMENT', 'EQUIPMENT', 'PERSONNEL', 'CARGO', 'NAVIGATION'];
const INCIDENT_TYPES = ['SAR', 'POLLUTION', 'OIL_SPILL', 'SECURITY_BREACH', 'CASUALTY', 'MEDICAL_EVAC', 'NEAR_MISS',
  'FIRE', 'COLLISION', 'GROUNDING', 'PERSONNEL_INJURY', 'EQUIPMENT_FAILURE', 'CARGO_DAMAGE', 'NAV_HAZARD', 'MOORING_FAILURE'];
const INCIDENT_STATUS = ['OPEN', 'ACKNOWLEDGED', 'RESPONDING', 'MONITORING', 'RESOLVED', 'CLOSED'];
const INCIDENT_SEVERITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const INCIDENT_PRIORITIES = ['P1', 'P2', 'P3', 'P4'];
const INCIDENT_SOURCES = ['VHF', 'PHONE', 'EMAIL', 'PATROL', 'PORTAL', 'CCTV', 'AIS'];
const INCIDENT_TRANSITIONS = {
  OPEN:         ['ACKNOWLEDGED', 'RESPONDING'],
  ACKNOWLEDGED: ['RESPONDING', 'RESOLVED'],
  RESPONDING:   ['MONITORING', 'RESOLVED'],
  MONITORING:   ['RESPONDING', 'RESOLVED'],
  RESOLVED:     ['CLOSED', 'RESPONDING'],   // RESPONDING here = reopened
  CLOSED:       ['RESPONDING'],             // reopen a closed case
};
const RESOURCE_TYPES = ['TUG', 'PILOT_LAUNCH', 'MOORING_BOAT', 'PILOT', 'SURVEY_LAUNCH'];

// default weights for the explainable risk engine (0-100 scale contribution caps)
const DEFAULT_RISK_WEIGHTS = {
  age: 15, certificates: 25, deficiencies: 20, detentions: 20, inspectionGap: 10, agentPerformance: 10,
};

module.exports = {
  PERMISSION_GROUPS, ALL_PERMISSIONS,
  SEAFARER_RANKS, SEAFARER_CERT_TYPES,
  INSTRUMENT_TYPES, INSTRUMENT_STATUS,
  LICENSE_TYPES, LICENSE_STATUS, LICENSE_TRANSITIONS,
  INCIDENT_CATEGORIES, INCIDENT_TYPES, INCIDENT_STATUS, INCIDENT_SEVERITY,
  INCIDENT_PRIORITIES, INCIDENT_SOURCES, INCIDENT_TRANSITIONS, RESOURCE_TYPES, DEFAULT_RISK_WEIGHTS,
  PORTCALL_STATUS, PORTCALL_TRANSITIONS,
  INSPECTION_TYPES, INSPECTION_STATUS, INSPECTION_RESULTS,
  INVOICE_STATUS, GST_RATE, LOOKUP_CATEGORIES, CERT_EXPIRING_DAYS,
  MODULE_SETTING_DEFAULTS,
};
