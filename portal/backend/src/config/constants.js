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

module.exports = {
  PERMISSION_GROUPS, ALL_PERMISSIONS,
  PORTCALL_STATUS, PORTCALL_TRANSITIONS,
  INSPECTION_TYPES, INSPECTION_STATUS, INSPECTION_RESULTS,
  INVOICE_STATUS, GST_RATE, LOOKUP_CATEGORIES, CERT_EXPIRING_DAYS,
};
