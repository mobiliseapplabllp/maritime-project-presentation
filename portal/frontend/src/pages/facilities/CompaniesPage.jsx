import { Chip, Rating } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import CorporateFareRoundedIcon from '@mui/icons-material/CorporateFareRounded';
import CrudPage from '../../components/common/CrudPage';

/* Port companies directory — every organisation working inside port limits. */

const CATEGORIES = [
  { value: 'AGENCY', label: 'Shipping agency' },
  { value: 'TERMINAL_OPERATOR', label: 'Terminal operator' },
  { value: 'SERVICE_PROVIDER', label: 'Service provider' },
  { value: 'SUPPLIER', label: 'Supplier' },
  { value: 'INSTITUTE', label: 'Institute' },
];
const STATUS_COLOR = { ACTIVE: 'success', SUSPENDED: 'warning', BLACKLISTED: 'error', INACTIVE: 'default' };

export default function CompaniesPage() {
  const navigate = useNavigate();
  return (
    <CrudPage
      title="Company directory" sub="Agents, terminal operators, suppliers, yards and institutes working inside port limits"
      icon={CorporateFareRoundedIcon} iconColor="#2C6E52"
      entityName="company" endpoint="/companies" permBase="facilities"
      exportName="port-companies" defaultSort="name"
      searchPlaceholder="Search name, code, GSTIN…"
      onRowClick={(r) => navigate(`/companies/${r._id}`)}
      columns={[
        { key: 'code', label: 'Code', mono: true, sortable: true },
        { key: 'name', label: 'Company', sortable: true, render: (r) => <b>{r.name}</b> },
        { key: 'category', label: 'Category', render: (r) => (CATEGORIES.find((c) => c.value === r.category) || {}).label || r.category },
        { key: 'city', label: 'City' },
        { key: 'gstin', label: 'GSTIN', mono: true, render: (r) => r.gstin || '—' },
        { key: 'rating', label: 'Rating', render: (r) => (r.rating ? <Rating value={r.rating} precision={0.5} size="small" readOnly /> : '—'), exportValue: (r) => r.rating || '' },
        { key: 'status', label: 'Status', render: (r) => <Chip size="small" label={r.status} color={STATUS_COLOR[r.status] || 'default'} sx={{ height: 20 }} /> },
        { key: 'real', label: '', noExport: true, render: (r) => (r.real ? <Chip size="small" variant="outlined" label="Documented operator" sx={{ height: 18, fontSize: 9.5 }} /> : null) },
      ]}
      filters={[
        { name: 'category', label: 'Category', options: CATEGORIES },
        { name: 'status', label: 'Status', options: Object.keys(STATUS_COLOR).map((s) => ({ value: s, label: s })) },
      ]}
      formFields={[
        { name: 'code', label: 'Short code', required: true }, { name: 'name', label: 'Company name', required: true },
        { name: 'category', label: 'Category', type: 'select', required: true, options: CATEGORIES },
        { name: 'contactPerson', label: 'Contact person' }, { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email' },
        { name: 'address', label: 'Address', cols: 12 }, { name: 'city', label: 'City' }, { name: 'state', label: 'State' },
        { name: 'gstin', label: 'GSTIN' }, { name: 'pan', label: 'PAN' },
        { name: 'status', label: 'Status', type: 'select', options: Object.keys(STATUS_COLOR).map((s) => ({ value: s, label: s })) },
        { name: 'rating', label: 'Performance rating (0–5)', type: 'number' },
        { name: 'remarks', label: 'Remarks', type: 'multiline', cols: 12 },
      ]}
      defaults={{ status: 'ACTIVE', city: '', state: '' }}
      statsScope="facilities"
      deleteMessage={(row) => `Remove ${row?.name} from the directory? Their licences remain on record.`}
    />
  );
}
