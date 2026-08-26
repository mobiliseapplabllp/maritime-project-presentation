import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Box, Card, Chip, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import AppRegistrationRoundedIcon from '@mui/icons-material/AppRegistrationRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import PageHeader from '../../components/common/PageHeader';
import PageStats from '../../components/common/PageStats';
import DataTable from '../../components/common/DataTable';
import StatusChip from '../../components/common/StatusChip';
import { fmtD } from '../../utils/format';

/* B1 — the register itself: every transaction against every ship, whatever
 * journey it belongs to. The four journeys sit in one list because a registrar
 * works a single queue, not four. */

export const REG_STATUS_META = {
  DRAFT: { label: 'Draft', color: 'default' },
  SUBMITTED: { label: 'Submitted', color: 'info' },
  UNDER_SCRUTINY: { label: 'Under scrutiny', color: 'info' },
  CARVING_NOTE_ISSUED: { label: 'Carving note issued', color: 'warning' },
  SURVEY_COMPLETE: { label: 'Survey complete', color: 'warning' },
  APPROVED: { label: 'Approved', color: 'success' },
  GRANTED: { label: 'Granted', color: 'success' },
  REJECTED: { label: 'Refused', color: 'error' },
  WITHDRAWN: { label: 'Withdrawn', color: 'default' },
};

export const KIND_META = {
  PERMANENT: { label: 'Permanent registration', short: 'Permanent', color: '#2C6E52' },
  PROVISIONAL: { label: 'Provisional certificate', short: 'Provisional', color: '#8A5A10' },
  AMENDMENT: { label: 'Amendment to the entry', short: 'Amendment', color: '#3B6FB6' },
  DELETION: { label: 'Closure of registry', short: 'Closure', color: '#96322C' },
};

export const REGISTRY_STATE_META = {
  REGISTERED: { label: 'Registered', color: 'success' },
  PROVISIONAL: { label: 'Provisional', color: 'warning' },
  CLOSED: { label: 'Registry closed', color: 'error' },
  UNREGISTERED: { label: 'Not on this register', color: 'default' },
};

export const KindChip = ({ kind }) => {
  const m = KIND_META[kind] || { short: kind, color: '#5b7180' };
  return <Chip size="small" label={m.short} sx={{ height: 21, fontSize: 11, color: m.color, borderColor: m.color }} variant="outlined" />;
};

export default function RegistrationsList() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [state, setState] = useState({ rows: [], total: 0, page: 1, limit: 20, q: '', sort: '-createdAt', loading: true });
  const [filters, setFilters] = useState({ status: '', kind: '', portOfRegistry: '' });
  const [ports, setPorts] = useState([]);

  useEffect(() => {
    api.get('/registrations/reference')
      .then((r) => setPorts(r.data.portsOfRegistry || []))
      .catch(() => {});
  }, []);

  const load = useCallback((over = {}) => {
    const s = { ...state, ...over };
    setState((x) => ({ ...x, ...over, loading: true }));
    const params = {
      page: s.page, limit: s.limit, q: s.q || undefined, sort: s.sort,
      status: filters.status || undefined, kind: filters.kind || undefined,
      portOfRegistry: filters.portOfRegistry || undefined,
    };
    api.get('/registrations', { params })
      .then((r) => setState((x) => ({ ...x, rows: r.data, total: r.meta?.total ?? r.data.length, loading: false })))
      .catch((e) => { dispatch(notify({ message: e.message, severity: 'error' })); setState((x) => ({ ...x, loading: false })); });
  }, [state.page, state.limit, state.q, state.sort, filters]); // eslint-disable-line

  useEffect(() => { load(); }, [state.page, state.limit, state.q, state.sort, filters]); // eslint-disable-line

  const sel = (name, label, options) => (
    <TextField
      select size="small" label={label} value={filters[name]} sx={{ minWidth: 178 }}
      onChange={(e) => { setFilters((f) => ({ ...f, [name]: e.target.value })); setState((x) => ({ ...x, page: 1 })); }}
    >
      <MenuItem value="">All</MenuItem>
      {options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
    </TextField>
  );

  return (
    <Box>
      <PageHeader
        icon={AppRegistrationRoundedIcon} iconColor="#2C6E52"
        title="Ship Register"
        sub="Registrar of Indian Ships — registration, amendment and closure of registry under the Merchant Shipping Act 1958, Part V"
      />
      <PageStats scope="registry" />
      <DataTable
        loading={state.loading}
        rows={state.rows} total={state.total} page={state.page} limit={state.limit}
        onPage={(p) => setState((x) => ({ ...x, page: p }))}
        onLimit={(l) => setState((x) => ({ ...x, limit: l, page: 1 }))}
        search={state.q} onSearch={(q) => setState((x) => ({ ...x, q, page: 1 }))}
        searchPlaceholder="Search application, ship, official number…"
        sort={state.sort} onSort={(s) => setState((x) => ({ ...x, sort: s }))}
        onRowClick={(r) => navigate(`/registry/${r._id}`)}
        emptyMessage="No registry transactions match those filters"
        toolbar={(
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {sel('kind', 'Transaction', Object.entries(KIND_META).map(([value, m]) => ({ value, label: m.label })))}
            {sel('status', 'Status', Object.entries(REG_STATUS_META).map(([value, m]) => ({ value, label: m.label })))}
            {sel('portOfRegistry', 'Port of registry', ports.map((p) => ({ value: p.code, label: p.name })))}
          </Box>
        )}
        columns={[
          { key: 'applicationNo', label: 'Application', mono: true, render: (r) => <b>{r.applicationNo}</b> },
          { key: 'kind', label: 'Transaction', render: (r) => <KindChip kind={r.kind} /> },
          { key: 'vesselName', label: 'Ship', render: (r) => (
            <Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{r.vesselName}</Typography>
              <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>IMO {r.imo}</Typography>
            </Box>
          ) },
          { key: 'officialNumber', label: 'Official no.', mono: true, render: (r) => r.officialNumber || '—' },
          { key: 'portOfRegistry', label: 'Port of registry', render: (r) => r.portOfRegistryName || r.portOfRegistry || '—' },
          { key: 'status', label: 'Status', render: (r) => (
            <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
              <StatusChip value={r.status} map={REG_STATUS_META} />
              {r.slaBreached && (
                <Tooltip title={`Past the registry SLA — due ${fmtD(r.dueAt)}`}>
                  <Chip size="small" color="error" label="Past due" sx={{ height: 21, fontSize: 11 }} />
                </Tooltip>
              )}
            </Box>
          ) },
          { key: 'certificateNo', label: 'Certificate', mono: true, render: (r) => r.certificateNo || '—' },
          { key: 'submittedAt', label: 'Lodged', render: (r) => fmtD(r.submittedAt) },
          { key: 'grantedOn', label: 'Granted', render: (r) => fmtD(r.grantedOn) },
        ]}
      />
      <Card sx={{ mt: 2, p: 1.75 }}>
        <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
          An official number is allocated when the carving and marking note is issued, not when the certificate
          is granted — the number has to exist before it can be cut into the main beam. A permanent certificate
          bridging from a provisional one carries the same number forward.
        </Typography>
      </Card>
    </Box>
  );
}
