import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ViewTimelineRoundedIcon from '@mui/icons-material/ViewTimelineRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageStats from '../../components/common/PageStats';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import FormFields from '../../components/common/FormFields';
import StatusChip from '../../components/common/StatusChip';
import EntityHover from '../../components/common/EntityHover';
import { PORTCALL_STATUS_META } from '../../utils/status';
import { fmtDT } from '../../utils/format';

export default function PortCallsList() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [state, setState] = useState({ rows: [], total: 0, page: 1, limit: 20, q: '', sort: '-eta', status: '', loading: true });
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState({});
  const [vessels, setVessels] = useState([]);
  const [agents, setAgents] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setState((x) => ({ ...x, loading: true }));
    api.get('/port-calls', { params: { page: state.page, limit: state.limit, q: state.q || undefined, sort: state.sort, status: state.status || undefined } })
      .then((r) => setState((x) => ({ ...x, rows: r.data, total: r.meta.total, loading: false })))
      .catch((e) => { dispatch(notify({ message: e.message, severity: 'error' })); setState((x) => ({ ...x, loading: false })); });
  };
  useEffect(load, [state.page, state.limit, state.q, state.sort, state.status]); // eslint-disable-line

  const openCreate = () => {
    setCreating(true);
    setValues({});
    api.get('/vessels', { params: { limit: 100, status: 'ACTIVE', sort: 'name' } }).then((r) => setVessels(r.data));
    api.get('/lookups', { params: { category: 'agent', limit: 100 } }).then((r) => setAgents(r.data));
  };

  const create = () => {
    setBusy(true);
    api.post('/port-calls', values)
      .then((r) => { dispatch(notify(`Call ${r.data.vcn} announced`)); setCreating(false); navigate(`/port-calls/${r.data._id}`); })
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
      .finally(() => setBusy(false));
  };

  const columns = [
    { key: 'vcn', label: 'VCN', mono: true, sortable: true },
    { key: 'vessel', label: 'Vessel', render: (r) => (r.vessel ? <EntityHover type="vessel" id={r.vessel._id}><b>{r.vessel.name}</b></EntityHover> : '—') },
    { key: 'type', label: 'Type', render: (r) => r.vessel?.type || '—' },
    { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} map={PORTCALL_STATUS_META} /> },
    { key: 'eta', label: 'ETA', sortable: true, render: (r) => fmtDT(r.eta), mono: true },
    { key: 'berth', label: 'Berth', render: (r) => r.berth?.code || '—', mono: true },
    { key: 'agentName', label: 'Agent' },
    { key: 'purpose', label: 'Purpose' },
  ];

  return (
    <>
      <PageHeader
        icon={ViewTimelineRoundedIcon} iconColor="#0797A5" title="Port calls" sub="Every vessel call from announcement to sailing"
        actions={hasPerm(user, 'portcalls.create') && (
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreate}>Announce call</Button>
        )}
      />
      <PageStats scope="portcalls" />
      <DataTable
        columns={columns} rows={state.rows} total={state.total} page={state.page} limit={state.limit}
        loading={state.loading} sort={state.sort}
        onPage={(page) => setState((x) => ({ ...x, page }))}
        onLimit={(limit) => setState((x) => ({ ...x, limit, page: 1 }))}
        onSort={(sort) => setState((x) => ({ ...x, sort }))}
        search={state.q} onSearch={(q) => setState((x) => ({ ...x, q, page: 1 }))}
        searchPlaceholder="Search VCN…"
        onRowClick={(r) => navigate(`/port-calls/${r._id}`)}
        toolbar={
          <FormFields
            fields={[{ name: 'status', label: 'Status', type: 'select', options: Object.entries(PORTCALL_STATUS_META).map(([value, m]) => ({ value, label: m.label })), cols: 12 }]}
            values={{ status: state.status }}
            onChange={(v) => setState((x) => ({ ...x, status: v.status, page: 1 }))}
          />
        }
      />
      <Dialog open={creating} onClose={() => !busy && setCreating(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Announce port call</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The call starts as <b>Announced</b> and moves through the lifecycle from its detail page.
          </Typography>
          <FormFields
            fields={[
              { name: 'vessel', label: 'Vessel', type: 'autocomplete', required: true, cols: 12, options: vessels.map((v) => ({ value: v._id, label: `${v.name} · IMO ${v.imo}` })) },
              { name: 'eta', label: 'ETA (pilot station)', type: 'datetime', required: true },
              { name: 'etd', label: 'ETD (planned)', type: 'datetime' },
              { name: 'agentCode', label: 'Shipping agent', type: 'select', options: agents.map((a) => ({ value: a.code, label: a.label })) },
              { name: 'purpose', label: 'Purpose', type: 'select', options: ['Discharge', 'Loading', 'Discharge + Loading', 'Bunkering', 'Crew change'].map((p) => ({ value: p, label: p })) },
              { name: 'prevPort', label: 'Last port', placeholder: 'SGSIN — Singapore' },
              { name: 'nextPort', label: 'Next port' },
              { name: 'remarks', label: 'Remarks', type: 'multiline', cols: 12 },
            ]}
            values={values} onChange={setValues}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setCreating(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={create} disabled={busy || !values.vessel || !values.eta}>Announce</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
