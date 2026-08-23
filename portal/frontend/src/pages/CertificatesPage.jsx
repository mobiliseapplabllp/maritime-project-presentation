import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chip, Stack } from '@mui/material';
import api from '../api/client';
import PageStats from '../components/common/PageStats';
import PageHeader from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import StatusChip from '../components/common/StatusChip';
import { CERT_STATUS_META } from '../utils/status';
import { fmtD } from '../utils/format';

export default function CertificatesPage() {
  const navigate = useNavigate();
  const [state, setState] = useState({ rows: [], total: 0, page: 1, limit: 25, q: '', status: '', loading: true });

  useEffect(() => {
    setState((x) => ({ ...x, loading: true }));
    api.get('/vessels/certificates/all', { params: { page: state.page, limit: state.limit, q: state.q || undefined, status: state.status || undefined } })
      .then((r) => setState((x) => ({ ...x, rows: r.data.map((c, i) => ({ ...c, _id: `${c.certId}-${i}` })), total: r.meta.total, loading: false })))
      .catch(() => setState((x) => ({ ...x, loading: false })));
  }, [state.page, state.limit, state.q, state.status]); // eslint-disable-line

  return (
    <>
      <PageHeader title="Fleet certificates" sub="Statutory certificates across all active vessels, ordered by expiry" />
      <PageStats scope="certificates" />
      <DataTable
        columns={[
          { key: 'vesselName', label: 'Vessel', render: (r) => <b>{r.vesselName}</b> },
          { key: 'imo', label: 'IMO', mono: true },
          { key: 'certType', label: 'Certificate' },
          { key: 'number', label: 'Number', mono: true },
          { key: 'issuer', label: 'Issuer' },
          { key: 'expiryDate', label: 'Expires', render: (r) => fmtD(r.expiryDate) },
          { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} map={CERT_STATUS_META} /> },
        ]}
        rows={state.rows} total={state.total} page={state.page} limit={state.limit} loading={state.loading}
        onPage={(page) => setState((x) => ({ ...x, page }))}
        onLimit={(limit) => setState((x) => ({ ...x, limit, page: 1 }))}
        search={state.q} onSearch={(q) => setState((x) => ({ ...x, q, page: 1 }))}
        searchPlaceholder="Search vessel or certificate…"
        onRowClick={(r) => navigate(`/vessels/${r.vesselId}`)}
        toolbar={
          <Stack direction="row" spacing={0.75}>
            {['', 'EXPIRED', 'EXPIRING', 'VALID'].map((s) => (
              <Chip key={s || 'all'} size="small" label={s ? CERT_STATUS_META[s].label : 'All'}
                color={state.status === s && s ? CERT_STATUS_META[s].color : 'default'}
                variant={state.status === s ? 'filled' : 'outlined'}
                onClick={() => setState((x) => ({ ...x, status: s, page: 1 }))} />
            ))}
          </Stack>
        }
      />
    </>
  );
}
