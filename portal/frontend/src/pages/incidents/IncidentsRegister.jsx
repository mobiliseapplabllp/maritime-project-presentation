import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CrisisAlertRoundedIcon from '@mui/icons-material/CrisisAlertRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import StatusChip from '../../components/common/StatusChip';
import FormDrawer from '../../components/common/FormDrawer';
import FormFields from '../../components/common/FormFields';
import PageStats from '../../components/common/PageStats';
import EntityHover from '../../components/common/EntityHover';
import { INCIDENT_STATUS_META, SEVERITY_META } from '../../utils/status';
import { fmtDT, fromNow } from '../../utils/format';

const tcase = (v) => String(v || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default function IncidentsRegister() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('-reportedAt');
  const [filters, setFilters] = useState({ status: '', severity: '', category: '' });
  const [loading, setLoading] = useState(true);
  const [statsKey, setStatsKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [vessels, setVessels] = useState([]);
  const [berths, setBerths] = useState([]);
  const [areas, setAreas] = useState([]);
  const [enums, setEnums] = useState({ incidentTypes: [], incidentCategories: [], incidentSeverity: [], incidentSources: [] });

  const load = useCallback(() => {
    setLoading(true);
    api.get('/incidents', { params: { page, limit, q, sort, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) } })
      .then((r) => { setRows(r.data); setTotal(r.meta.total); })
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
      .finally(() => setLoading(false));
  }, [page, limit, q, sort, filters, dispatch]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/meta').then((r) => setEnums(r.data)).catch(() => {});
    api.get('/vessels', { params: { limit: 100, sort: 'name' } }).then((r) => setVessels(r.data)).catch(() => {});
    api.get('/berths', { params: { limit: 100 } }).then((r) => setBerths(r.data)).catch(() => {});
    api.get('/lookups', { params: { category: 'incidentArea', limit: 100 } }).then((r) => setAreas(r.data)).catch(() => {});
  }, []);

  const canCreate = hasPerm(user, 'incidents.create');

  const create = () => {
    setBusy(true);
    api.post('/incidents', { ...values, location: values.area ? { area: values.area } : undefined })
      .then((r) => { dispatch(notify(`Incident ${r.data.number} logged`)); setCreating(false); setStatsKey((k2) => k2 + 1); navigate(`/incidents/${r.data._id}`); })
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
      .finally(() => setBusy(false));
  };

  const filterField = (name, label, options) => (
    <TextField select size="small" label={label} value={filters[name]} sx={{ width: 150 }}
      onChange={(e) => { setFilters((f) => ({ ...f, [name]: e.target.value })); setPage(1); }}>
      <MenuItem value="">All</MenuItem>
      {options.map((o) => <MenuItem key={o} value={o}>{tcase(o)}</MenuItem>)}
    </TextField>
  );

  return (
    <>
      <PageHeader
        icon={CrisisAlertRoundedIcon} iconColor="#B3452E" title="Incident register" sub="Every logged case — search, filter, drill into the case file"
        actions={canCreate && (
          <Button variant="contained" startIcon={<AddRoundedIcon />}
            onClick={() => { setValues({ severity: 'MEDIUM', category: 'MARINE', source: 'PORTAL' }); setCreating(true); }}>
            Log incident
          </Button>
        )}
      />
      <PageStats scope="incidents" refreshKey={statsKey} />
      <DataTable
        columns={[
          { key: 'number', label: 'Case no.', mono: true, sortable: true, render: (r) => (
            <EntityHover type="incident" id={r._id}><span>{r.number}</span></EntityHover>) },
          { key: 'title', label: 'Title', render: (r) => (
            <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, maxWidth: 380 }}>{r.title}</Typography>) },
          { key: 'category', label: 'Category', render: (r) => tcase(r.category) },
          { key: 'severity', label: 'Severity', sortable: true, render: (r) => <StatusChip value={r.severity} map={SEVERITY_META} /> },
          { key: 'status', label: 'Status', sortable: true, render: (r) => <StatusChip value={r.status} map={INCIDENT_STATUS_META} /> },
          { key: 'vessel', label: 'Vessel / craft', render: (r) => r.vessel
            ? <EntityHover type="vessel" id={r.vessel._id}><span>{r.vessel.name}</span></EntityHover>
            : (r.vesselName || '—') },
          { key: 'assignedTo', label: 'Case officer', render: (r) => r.assignedTo?.userId
            ? <EntityHover type="user" id={r.assignedTo.userId}><span>{r.assignedTo.name}</span></EntityHover>
            : (r.assignedTo?.name || '—') },
          { key: 'reportedAt', label: 'Reported', sortable: true, render: (r) => (
            <span title={fmtDT(r.reportedAt)}>{fromNow(r.reportedAt)}</span>) },
        ]}
        rows={rows} total={total} page={page} limit={limit} loading={loading}
        onPage={setPage} onLimit={(l) => { setLimit(l); setPage(1); }}
        search={q} onSearch={(v) => { setQ(v); setPage(1); }} searchPlaceholder="Search case no, title, craft…"
        sort={sort} onSort={setSort}
        onRowClick={(r) => navigate(`/incidents/${r._id}`)}
        toolbar={(
          <Stack direction="row" spacing={1}>
            {filterField('status', 'Status', enums.incidentStatus || [])}
            {filterField('severity', 'Severity', enums.incidentSeverity || [])}
            {filterField('category', 'Category', enums.incidentCategories || [])}
          </Stack>
        )}
      />

      <FormDrawer
        open={creating} title="Log a new incident" subtitle="A case number is assigned automatically; the lifecycle starts at OPEN"
        onClose={() => !busy && setCreating(false)} busy={busy}
        onSubmit={create} submitLabel="Log incident" disabled={!(values.type && values.title)}>
        <FormFields
          fields={[
            { name: 'title', label: 'Title', required: true, cols: 12, placeholder: 'What happened, where — one line' },
            { name: 'category', label: 'Category', type: 'select', required: true, options: (enums.incidentCategories || []).map((c) => ({ value: c, label: tcase(c) })) },
            { name: 'type', label: 'Incident type', type: 'select', required: true, options: (enums.incidentTypes || []).map((c) => ({ value: c, label: tcase(c) })) },
            { name: 'severity', label: 'Severity', type: 'select', options: (enums.incidentSeverity || []).map((c) => ({ value: c, label: tcase(c) })) },
            { name: 'source', label: 'Reported via', type: 'select', options: (enums.incidentSources || []).map((c) => ({ value: c, label: c })) },
            { name: 'vessel', label: 'Vessel (registered)', type: 'select', options: [{ value: '', label: '— none —' }, ...vessels.map((v) => ({ value: v._id, label: v.name }))] },
            { name: 'vesselName', label: 'Craft (unregistered)', placeholder: 'FV name / registration if not in the registry' },
            { name: 'berth', label: 'Berth', type: 'select', options: [{ value: '', label: '— none —' }, ...berths.map((b) => ({ value: b._id, label: `${b.code} — ${b.terminal}` }))] },
            { name: 'area', label: 'Location / area (master)', type: 'select', options: [{ value: '', label: '— none —' }, ...areas.map((a) => ({ value: a.label, label: a.label }))] },
            { name: 'reportedBy', label: 'Reported by', placeholder: 'Defaults to you' },
            { name: 'description', label: 'First information', type: 'multiline', rows: 3, cols: 12 },
          ]}
          values={values} onChange={setValues}
        />
      </FormDrawer>
    </>
  );
}
