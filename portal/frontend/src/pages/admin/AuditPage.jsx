import { useEffect, useState } from 'react';
import { Chip } from '@mui/material';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import api from '../../api/client';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import FormFields from '../../components/common/FormFields';
import JsonDialog from '../../components/common/JsonDialog';
import { fmtDT } from '../../utils/format';

const ENTITIES = ['User', 'Role', 'Vessel', 'PortCall', 'Inspection', 'Invoice', 'Berth', 'Lookup', 'TariffItem', 'ChecklistTemplate', 'Setting'];
const ACTION_COLOR = { CREATE: 'success', UPDATE: 'info', DELETE: 'error', TRANSITION: 'primary', LOGIN: 'default', CLOSE: 'warning', ISSUE: 'info', PAY: 'success' };

export default function AuditPage() {
  const [state, setState] = useState({ rows: [], total: 0, page: 1, limit: 25, q: '', entity: '', loading: true });
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    setState((x) => ({ ...x, loading: true }));
    api.get('/audit', { params: { page: state.page, limit: state.limit, q: state.q || undefined, entity: state.entity || undefined } })
      .then((r) => setState((x) => ({ ...x, rows: r.data, total: r.meta.total, loading: false })))
      .catch(() => setState((x) => ({ ...x, loading: false })));
  }, [state.page, state.limit, state.q, state.entity]); // eslint-disable-line

  return (
    <>
      <PageHeader icon={HistoryRoundedIcon} iconColor="#0A2239" title="Audit log" sub="Every write in the system — who, what, when, before and after" />
      <DataTable
        columns={[
          { key: 'at', label: 'When', render: (r) => fmtDT(r.at), mono: true },
          { key: 'actor', label: 'Actor', render: (r) => <b>{r.actor?.name || 'system'}</b> },
          { key: 'action', label: 'Action', render: (r) => <Chip size="small" label={r.action} color={ACTION_COLOR[r.action] || 'default'} variant="outlined" sx={{ height: 20, fontSize: 10.5 }} /> },
          { key: 'entity', label: 'Entity' },
          { key: 'entityLabel', label: 'Record' },
          { key: 'ip', label: 'IP', mono: true },
        ]}
        rows={state.rows} total={state.total} page={state.page} limit={state.limit} loading={state.loading}
        onPage={(page) => setState((x) => ({ ...x, page }))}
        onLimit={(limit) => setState((x) => ({ ...x, limit, page: 1 }))}
        search={state.q} onSearch={(q) => setState((x) => ({ ...x, q, page: 1 }))}
        searchPlaceholder="Search record or actor…"
        onRowClick={(r) => setDetail(r)}
        toolbar={
          <FormFields
            fields={[{ name: 'entity', label: 'Entity', type: 'select', options: ENTITIES.map((e) => ({ value: e, label: e })) }]}
            values={{ entity: state.entity }}
            onChange={(v) => setState((x) => ({ ...x, entity: v.entity ?? '', page: 1 }))}
          />
        }
      />
      <JsonDialog
        open={!!detail} onClose={() => setDetail(null)}
        title={detail ? `${detail.action} · ${detail.entity} · ${detail.entityLabel}` : ''}
        before={detail?.before} after={detail?.after}
      />
    </>
  );
}
