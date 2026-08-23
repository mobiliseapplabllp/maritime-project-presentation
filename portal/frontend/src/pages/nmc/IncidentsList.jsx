import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Chip } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import FormFields from '../../components/common/FormFields';
import FormDrawer from '../../components/common/FormDrawer';
import { fmtDT } from '../../utils/format';

export const INC_STATUS_META = { OPEN: ['Open', 'error'], RESPONDING: ['Responding', 'warning'], CLOSED: ['Closed', 'success'] };
export const SEV_META = { LOW: ['Low', 'default'], MEDIUM: ['Medium', 'info'], HIGH: ['High', 'warning'], CRITICAL: ['Critical', 'error'] };

export default function IncidentsList() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [state, setState] = useState({ rows: [], total: 0, page: 1, limit: 20, q: '', sort: '-reportedAt', status: '', type: '', loading: true });
  const [meta, setMeta] = useState({ incidentTypes: [], incidentSeverity: [] });
  const [creating, setCreating] = useState(false);
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/meta').then((r) => setMeta(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    setState((x) => ({ ...x, loading: true }));
    api.get('/incidents', { params: { page: state.page, limit: state.limit, q: state.q || undefined, sort: state.sort, status: state.status || undefined, type: state.type || undefined } })
      .then((r) => setState((x) => ({ ...x, rows: r.data, total: r.meta.total, loading: false })))
      .catch((e) => { dispatch(notify({ message: e.message, severity: 'error' })); setState((x) => ({ ...x, loading: false })); });
  }, [state.page, state.limit, state.q, state.sort, state.status, state.type]); // eslint-disable-line

  return (
    <>
      <PageHeader
        title="Incidents & SAR" sub="MRCC log — search and rescue, pollution, security, casualty and medevac"
        actions={hasPerm(user, 'nmc.manage') && (
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => { setVals({ severity: 'MEDIUM' }); setCreating(true); }}>Open incident</Button>
        )}
      />
      <DataTable
        columns={[
          { key: 'number', label: 'Number', mono: true, render: (r) => <b>{r.number}</b> },
          { key: 'type', label: 'Type', render: (r) => <Chip size="small" variant="outlined" label={r.type.replace(/_/g, ' ')} sx={{ height: 20, fontSize: 10.5 }} /> },
          { key: 'title', label: 'Incident' },
          { key: 'vessel', label: 'Vessel / craft', render: (r) => r.vessel?.name || r.vesselName || '—' },
          { key: 'severity', label: 'Severity', render: (r) => { const [l, c] = SEV_META[r.severity]; return <Chip size="small" label={l} color={c} variant={c === 'default' ? 'outlined' : 'filled'} sx={{ height: 21, fontSize: 11 }} />; } },
          { key: 'status', label: 'Status', render: (r) => { const [l, c] = INC_STATUS_META[r.status]; return <Chip size="small" label={l} color={c} sx={{ height: 21, fontSize: 11 }} />; } },
          { key: 'reportedAt', label: 'Reported', sortable: true, render: (r) => fmtDT(r.reportedAt) },
        ]}
        rows={state.rows} total={state.total} page={state.page} limit={state.limit} loading={state.loading}
        sort={state.sort}
        onPage={(page) => setState((x) => ({ ...x, page }))}
        onLimit={(limit) => setState((x) => ({ ...x, limit, page: 1 }))}
        onSort={(sort) => setState((x) => ({ ...x, sort }))}
        search={state.q} onSearch={(q) => setState((x) => ({ ...x, q, page: 1 }))}
        searchPlaceholder="Search number, title, craft…"
        onRowClick={(r) => navigate(`/nmc/incidents/${r._id}`)}
        toolbar={
          <FormFields
            fields={[
              { name: 'status', label: 'Status', type: 'select', options: Object.entries(INC_STATUS_META).map(([value, [label]]) => ({ value, label })) },
              { name: 'type', label: 'Type', type: 'select', options: (meta.incidentTypes || []).map((t) => ({ value: t, label: t.replace(/_/g, ' ') })) },
            ]}
            values={{ status: state.status, type: state.type }}
            onChange={(v) => setState((x) => ({ ...x, status: v.status ?? '', type: v.type ?? '', page: 1 }))}
          />
        }
      />
      <FormDrawer
        open={creating} title="Open incident" subtitle="Creates an MRCC log entry and alerts the duty team on high severity"
        onClose={() => setCreating(false)} busy={busy} submitLabel="Open incident"
        disabled={!vals.type || !vals.title}
        onSubmit={() => {
          setBusy(true);
          api.post('/incidents', vals)
            .then((r) => { dispatch(notify(`Incident ${r.data.number} opened`)); setCreating(false); navigate(`/nmc/incidents/${r.data._id}`); })
            .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
            .finally(() => setBusy(false));
        }}>
        <FormFields
          fields={[
            { name: 'type', label: 'Incident type', type: 'select', required: true, options: (meta.incidentTypes || []).map((t) => ({ value: t, label: t.replace(/_/g, ' ') })) },
            { name: 'severity', label: 'Severity', type: 'select', required: true, options: (meta.incidentSeverity || []).map((s) => ({ value: s, label: s })) },
            { name: 'title', label: 'One-line description', required: true, cols: 12 },
            { name: 'vesselName', label: 'Vessel / craft (free text)' },
            { name: 'reportedBy', label: 'Reported by' },
          ]}
          values={vals} onChange={setVals}
        />
      </FormDrawer>
    </>
  );
}
