export const PORTCALL_STATUS_META = {
  ANNOUNCED: { label: 'Announced', color: 'default' },
  CONFIRMED: { label: 'Confirmed', color: 'info' },
  AT_ANCHORAGE: { label: 'At anchorage', color: 'warning' },
  BERTHED: { label: 'Berthed', color: 'success' },
  SAILED: { label: 'Sailed', color: 'default' },
  CANCELLED: { label: 'Cancelled', color: 'error' },
};
export const INSPECTION_STATUS_META = {
  PLANNED: { label: 'Planned', color: 'default' },
  IN_PROGRESS: { label: 'In progress', color: 'warning' },
  CLOSED: { label: 'Closed', color: 'success' },
};
export const RESULT_META = {
  SATISFACTORY: { label: 'Satisfactory', color: 'success' },
  DEFICIENCIES: { label: 'Deficiencies', color: 'warning' },
  DETAINED: { label: 'Detained', color: 'error' },
};
export const INVOICE_STATUS_META = {
  DRAFT: { label: 'Draft', color: 'default' },
  ISSUED: { label: 'Issued', color: 'info' },
  PAID: { label: 'Paid', color: 'success' },
  CANCELLED: { label: 'Cancelled', color: 'error' },
};
export const CERT_STATUS_META = {
  VALID: { label: 'Valid', color: 'success' },
  EXPIRING: { label: 'Expiring soon', color: 'warning' },
  EXPIRED: { label: 'Expired', color: 'error' },
};
export const BERTH_STATUS_META = {
  OPERATIONAL: { label: 'Operational', color: 'success' },
  MAINTENANCE: { label: 'Maintenance', color: 'warning' },
};
export const INCIDENT_STATUS_META = {
  OPEN: { label: 'Open', color: 'error' },
  ACKNOWLEDGED: { label: 'Acknowledged', color: 'warning' },
  RESPONDING: { label: 'Responding', color: 'warning' },
  MONITORING: { label: 'Monitoring', color: 'info' },
  RESOLVED: { label: 'Resolved', color: 'success' },
  CLOSED: { label: 'Closed', color: 'default' },
};
export const SEVERITY_META = {
  LOW: { label: 'Low', color: 'default' },
  MEDIUM: { label: 'Medium', color: 'info' },
  HIGH: { label: 'High', color: 'warning' },
  CRITICAL: { label: 'Critical', color: 'error' },
};
export const RESOURCE_STATUS_META = {
  AVAILABLE: { label: 'Available', color: 'success' },
  TASKED: { label: 'Tasked', color: 'info' },
  MAINTENANCE: { label: 'Maintenance', color: 'warning' },
  OFF_DUTY: { label: 'Off duty', color: 'default' },
};
export const TASK_STATUS_META = {
  OPEN: { label: 'Open', color: 'warning' },
  DONE: { label: 'Done', color: 'success' },
};
