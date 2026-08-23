import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chip, Badge } from '@mui/material';
import api from '../../api/client';
import CrudPage from '../../components/common/CrudPage';
import EntityHover from '../../components/common/EntityHover';
import { fmtNum } from '../../utils/format';

const STATUS_META = { ACTIVE: ['Active', 'success'], SHORE_LEAVE: ['Shore leave', 'info'], SIGNED_OFF: ['Signed off', 'default'], SUSPENDED: ['Suspended', 'error'] };

export default function SeafarersList() {
  const navigate = useNavigate();
  const [ranks, setRanks] = useState([]);
  useEffect(() => { api.get('/meta').then((r) => setRanks(r.data.seafarerRanks || [])).catch(() => {}); }, []);

  return (
    <CrudPage
      statsScope="seafarers" title="Seafarer register" sub="Crew identity, competency certificates and verified sea service"
      entityName="seafarer" endpoint="/seafarers"
      perms={{ create: 'seafarers.create', edit: 'seafarers.edit', del: 'seafarers.delete' }}
      defaultSort="name" searchPlaceholder="Search name, CDC, INDoS…"
      onRowClick={(r) => navigate(`/seafarers/${r._id}`)}
      columns={[
        { key: 'name', label: 'Seafarer', render: (r) => <EntityHover type="seafarer" id={r._id}><b>{r.name}</b></EntityHover> },
        { key: 'cdcNo', label: 'CDC No.', mono: true },
        { key: 'indosNo', label: 'INDoS', mono: true },
        { key: 'rank', label: 'Rank' },
        { key: 'nationality', label: 'Nationality' },
        { key: 'certAlerts', label: 'Cert alerts', align: 'center',
          render: (r) => (r.certAlerts ? <Badge badgeContent={r.certAlerts} color="error"><Chip size="small" label="review" color="warning" variant="outlined" sx={{ height: 20, fontSize: 10.5 }} /></Badge> : '—') },
        { key: 'totalSeaDays', label: 'Sea days', align: 'right', render: (r) => fmtNum(r.totalSeaDays), mono: true },
        { key: 'status', label: 'Status', render: (r) => { const [l, c] = STATUS_META[r.status] || [r.status, 'default']; return <Chip size="small" label={l} color={c} sx={{ height: 21, fontSize: 11 }} variant={c === 'default' ? 'outlined' : 'filled'} />; } },
      ]}
      filters={[
        { name: 'rank', label: 'Rank', options: ranks.map((r) => ({ value: r, label: r })) },
        { name: 'status', label: 'Status', options: Object.entries(STATUS_META).map(([value, [label]]) => ({ value, label })) },
      ]}
      formFields={[
        { name: 'name', label: 'Full name', required: true },
        { name: 'rank', label: 'Rank', type: 'select', required: true, options: ranks.map((r) => ({ value: r, label: r })) },
        { name: 'cdcNo', label: 'CDC number', required: true, helper: 'Continuous Discharge Certificate' },
        { name: 'indosNo', label: 'INDoS number' },
        { name: 'dob', label: 'Date of birth', type: 'date' },
        { name: 'nationality', label: 'Nationality' },
        { name: 'phone', label: 'Phone' }, { name: 'email', label: 'Email' },
        { name: 'status', label: 'Status', type: 'select', options: Object.entries(STATUS_META).map(([value, [label]]) => ({ value, label })) },
        { name: 'remarks', label: 'Remarks', type: 'multiline', cols: 12 },
      ]}
      defaults={{ nationality: 'India', status: 'ACTIVE' }}
      toForm={(row) => ({ ...row, dob: row.dob ? row.dob.slice(0, 10) : '' })}
      deleteMessage={(r) => `Remove ${r?.name} from the register? Certificates and sea service go with the record.`}
    />
  );
}
