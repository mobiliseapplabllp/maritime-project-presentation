import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, Chip } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageStats from '../../components/common/PageStats';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import FormFields from '../../components/common/FormFields';
import StatusChip from '../../components/common/StatusChip';
import EntityHover from '../../components/common/EntityHover';
import { INSPECTION_STATUS_META, RESULT_META } from '../../utils/status';
import { fmtDT, toInputDT } from '../../utils/format';

const TYPES = ['PSC', 'FSI', 'ISM', 'ISPS', 'MLC'];

export default function InspectionsList() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [state, setState] = useState({ rows: [], total: 0, page: 1, limit: 20, q: '', sort: '-plannedAt', status: '', type: '', loading: true });
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState({});
  const [vessels, setVessels] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setState((x) => ({ ...x, loading: true }));
    api.get('/inspections', { params: { page: state.page, limit: state.limit, q: state.q || undefined, sort: state.sort, status: state.status || undefined, type: state.type || undefined } })
      .then((r) => setState((x) => ({ ...x, rows: r.data, total: r.meta.total, loading: false })))
      .catch((e) => { dispatch(notify({ message: e.message, severity: 'error' })); setState((x) => ({ ...x, loading: false })); });
  };
  useEffect(load, [state.page, state.limit, state.q, state.sort, state.status, state.type]); // eslint-disable-line

  return (
    <>
      <PageHeader
        icon={FactCheckRoundedIcon} iconColor="#9C6412" title="Inspections & audits" sub="PSC, flag state, ISM, ISPS and MLC inspections"
        actions={hasPerm(user, 'inspections.create') && (
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => {
            setValues({ plannedAt: toInputDT(new Date()), inspector: user.name });
            api.get('/vessels', { params: { limit: 100, sort: 'name' } }).then((r) => setVessels(r.data));
            api.get('/checklist-templates', { params: { limit: 50 } }).then((r) => setTemplates(r.data));
            setCreating(true);
          }}>New inspection</Button>
        )}
      />
      <PageStats scope="inspections" />
      <DataTable
        columns={[
          { key: 'number', label: 'Number', mono: true, sortable: true },
          { key: 'vessel', label: 'Vessel', render: (r) => (r.vessel ? <EntityHover type="vessel" id={r.vessel._id}><b>{r.vessel.name}</b></EntityHover> : '—') },
          { key: 'type', label: 'Type', render: (r) => <Chip size="small" variant="outlined" label={r.type} sx={{ height: 20, fontSize: 11 }} /> },
          { key: 'inspector', label: 'Inspector' },
          { key: 'plannedAt', label: 'Planned', sortable: true, render: (r) => fmtDT(r.plannedAt) },
          { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} map={INSPECTION_STATUS_META} /> },
          { key: 'result', label: 'Result', render: (r) => (r.result ? <StatusChip value={r.result} map={RESULT_META} /> : '—') },
          { key: 'findings', label: 'Findings', align: 'right', render: (r) => r.findings?.length || 0 },
        ]}
        rows={state.rows} total={state.total} page={state.page} limit={state.limit} loading={state.loading}
        sort={state.sort}
        onPage={(page) => setState((x) => ({ ...x, page }))}
        onLimit={(limit) => setState((x) => ({ ...x, limit, page: 1 }))}
        onSort={(sort) => setState((x) => ({ ...x, sort }))}
        search={state.q} onSearch={(q) => setState((x) => ({ ...x, q, page: 1 }))}
        searchPlaceholder="Search number or inspector…"
        onRowClick={(r) => navigate(`/inspections/${r._id}`)}
        toolbar={
          <FormFields
            fields={[
              { name: 'status', label: 'Status', type: 'select', options: Object.entries(INSPECTION_STATUS_META).map(([value, m]) => ({ value, label: m.label })) },
              { name: 'type', label: 'Type', type: 'select', options: TYPES.map((t) => ({ value: t, label: t })) },
            ]}
            values={{ status: state.status, type: state.type }}
            onChange={(vls) => setState((x) => ({ ...x, status: vls.status ?? '', type: vls.type ?? '', page: 1 }))}
          />
        }
      />
      <Dialog open={creating} onClose={() => !busy && setCreating(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Plan inspection</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <FormFields
            fields={[
              { name: 'vessel', label: 'Vessel', type: 'autocomplete', required: true, cols: 12, options: vessels.map((x) => ({ value: x._id, label: `${x.name} · IMO ${x.imo}` })) },
              { name: 'type', label: 'Inspection type', type: 'select', required: true, options: TYPES.map((t) => ({ value: t, label: t })) },
              { name: 'plannedAt', label: 'Planned date/time', type: 'datetime', required: true },
              { name: 'inspector', label: 'Inspector', required: true },
              { name: 'templateId', label: 'Checklist template', type: 'select', options: templates.map((t) => ({ value: t._id, label: `${t.name} (${t.items.length} items)` })) },
              { name: 'remarks', label: 'Remarks', type: 'multiline', cols: 12 },
            ]}
            values={values} onChange={setValues}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setCreating(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" disabled={busy || !values.vessel || !values.type || !values.inspector} onClick={() => {
            setBusy(true);
            api.post('/inspections', values)
              .then((r) => { dispatch(notify(`Inspection ${r.data.number} planned`)); setCreating(false); navigate(`/inspections/${r.data._id}`); })
              .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
              .finally(() => setBusy(false));
          }}>Create</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
