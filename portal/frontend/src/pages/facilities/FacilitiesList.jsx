import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chip, Rating } from '@mui/material';
import api from '../../api/client';
import CrudPage from '../../components/common/CrudPage';
import { fmtD } from '../../utils/format';

export const LICENSE_STATUS_META = {
  APPLIED: ['Applied', 'default'], UNDER_REVIEW: ['Under review', 'info'], ISSUED: ['Issued', 'success'],
  REJECTED: ['Rejected', 'error'], SUSPENDED: ['Suspended', 'warning'], REVOKED: ['Revoked', 'error'],
};
export const licLabel = (t) => String(t || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default function FacilitiesList() {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  useEffect(() => { api.get('/meta').then((r) => setTypes(r.data.licenseTypes || [])).catch(() => {}); }, []);

  return (
    <CrudPage
      statsScope="facilities" title="Facilities & companies" sub="Licensed port ecosystem — agencies, suppliers, yards, institutes and ISPS facilities"
      entityName="licence" endpoint="/licenses"
      perms={{ create: 'facilities.manage', edit: 'facilities.manage', del: 'facilities.manage' }}
      searchPlaceholder="Search licence no, entity…"
      onRowClick={(r) => navigate(`/facilities/${r._id}`)}
      columns={[
        { key: 'licenseNo', label: 'Licence', mono: true, render: (r) => <b>{r.licenseNo}</b> },
        { key: 'entityName', label: 'Entity' },
        { key: 'entityType', label: 'Type', render: (r) => licLabel(r.entityType) },
        { key: 'status', label: 'Status', render: (r) => { const [l, c] = LICENSE_STATUS_META[r.status] || [r.status, 'default']; return <Chip size="small" label={l} color={c} sx={{ height: 21, fontSize: 11 }} variant={c === 'default' ? 'outlined' : 'filled'} />; } },
        { key: 'issueDate', label: 'Issued', render: (r) => fmtD(r.issueDate) },
        { key: 'expiryDate', label: 'Expires', render: (r) => fmtD(r.expiryDate) },
        { key: 'performanceRating', label: 'Performance', render: (r) => (r.performanceRating ? <Rating value={r.performanceRating} precision={0.5} size="small" readOnly /> : '—') },
        { key: 'audits', label: 'Audits', align: 'right', render: (r) => r.audits?.length || 0 },
      ]}
      filters={[
        { name: 'entityType', label: 'Type', options: types.map((t) => ({ value: t, label: licLabel(t) })) },
        { name: 'status', label: 'Status', options: Object.entries(LICENSE_STATUS_META).map(([value, [label]]) => ({ value, label })) },
      ]}
      addLabel="New application"
      formFields={[
        { name: 'entityName', label: 'Entity name', required: true },
        { name: 'entityType', label: 'Licence type', type: 'select', required: true, options: types.map((t) => ({ value: t, label: licLabel(t) })) },
        { name: 'contactPerson', label: 'Contact person' }, { name: 'phone', label: 'Phone' },
        { name: 'email', label: 'Email' }, { name: 'gstin', label: 'GSTIN' },
        { name: 'address', label: 'Address', type: 'multiline', cols: 12 },
        { name: 'conditions', label: 'Conditions', type: 'multiline', cols: 12 },
      ]}
      deleteMessage={(r) => `Delete application ${r?.licenseNo}? Issued licences should be revoked, not deleted.`}
    />
  );
}
