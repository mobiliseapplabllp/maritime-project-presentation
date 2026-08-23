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
  { module: 'legislation',  label: 'Legislation & Circulars', actions: ['view', 'manage'] },
  { module: 'facilities',   label: 'Facilities & Companies',  actions: ['view', 'manage', 'approve'] },
  { module: 'nmc',          label: 'Maritime Centre (MDA)',   actions: ['view', 'manage'] },
  { module: 'risk',         label: 'Compliance & Risk',       actions: ['view', 'manage'] },
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
];

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

const INCIDENT_TYPES = ['SAR', 'POLLUTION', 'SECURITY', 'CASUALTY', 'MEDICAL_EVAC', 'NEAR_MISS'];
const INCIDENT_STATUS = ['OPEN', 'RESPONDING', 'CLOSED'];
const INCIDENT_SEVERITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// default weights for the explainable risk engine (0-100 scale contribution caps)
const DEFAULT_RISK_WEIGHTS = {
  age: 15, certificates: 25, deficiencies: 20, detentions: 20, inspectionGap: 10, agentPerformance: 10,
};

module.exports = {
  PERMISSION_GROUPS, ALL_PERMISSIONS,
  SEAFARER_RANKS, SEAFARER_CERT_TYPES,
  INSTRUMENT_TYPES, INSTRUMENT_STATUS,
  LICENSE_TYPES, LICENSE_STATUS, LICENSE_TRANSITIONS,
  INCIDENT_TYPES, INCIDENT_STATUS, INCIDENT_SEVERITY, DEFAULT_RISK_WEIGHTS,
  PORTCALL_STATUS, PORTCALL_TRANSITIONS,
  INSPECTION_TYPES, INSPECTION_STATUS, INSPECTION_RESULTS,
  INVOICE_STATUS, GST_RATE, LOOKUP_CATEGORIES, CERT_EXPIRING_DAYS,
};
