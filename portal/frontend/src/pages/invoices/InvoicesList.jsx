import { useEffect, useState } from 'react';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import PageStats from '../../components/common/PageStats';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import FormFields from '../../components/common/FormFields';
import StatusChip from '../../components/common/StatusChip';
import EntityHover from '../../components/common/EntityHover';
import { INVOICE_STATUS_META } from '../../utils/status';
import { fmtD, fmtINR } from '../../utils/format';

export default function InvoicesList() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [state, setState] = useState({ rows: [], total: 0, page: 1, limit: 20, q: '', sort: '-createdAt', status: '', loading: true });

  useEffect(() => {
    setState((x) => ({ ...x, loading: true }));
    api.get('/invoices', { params: { page: state.page, limit: state.limit, q: state.q || undefined, sort: state.sort, status: state.status || undefined } })
      .then((r) => setState((x) => ({ ...x, rows: r.data, total: r.meta.total, loading: false })))
      .catch((e) => { dispatch(notify({ message: e.message, severity: 'error' })); setState((x) => ({ ...x, loading: false })); });
  }, [state.page, state.limit, state.q, state.sort, state.status]); // eslint-disable-line

  return (
    <>
      <PageHeader icon={ReceiptLongRoundedIcon} iconColor="#BD3861" title="Invoices" sub="Port charges billed per call — draft, issue, collect" />
      <PageStats scope="invoices" />
      <DataTable
        columns={[
          { key: 'number', label: 'Invoice no.', mono: true, sortable: true },
          { key: 'vessel', label: 'Vessel', render: (r) => (r.vessel ? <EntityHover type="vessel" id={r.vessel._id}><b>{r.vessel.name}</b></EntityHover> : '—') },
          { key: 'portCall', label: 'Call', mono: true, render: (r) => r.portCall?.vcn || '—' },
          { key: 'billTo', label: 'Billed to', render: (r) => r.billTo?.name || '—' },
          { key: 'total', label: 'Total (incl. GST)', align: 'right', render: (r) => fmtINR(r.total), mono: true },
          { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} map={INVOICE_STATUS_META} /> },
          { key: 'issuedAt', label: 'Issued', render: (r) => fmtD(r.issuedAt) },
          { key: 'paidAt', label: 'Paid', render: (r) => fmtD(r.paidAt) },
        ]}
        rows={state.rows} total={state.total} page={state.page} limit={state.limit} loading={state.loading}
        sort={state.sort}
        onPage={(page) => setState((x) => ({ ...x, page }))}
        onLimit={(limit) => setState((x) => ({ ...x, limit, page: 1 }))}
        onSort={(sort) => setState((x) => ({ ...x, sort }))}
        search={state.q} onSearch={(q) => setState((x) => ({ ...x, q, page: 1 }))}
        searchPlaceholder="Search invoice number…"
        onRowClick={(r) => navigate(`/invoices/${r._id}`)}
        toolbar={
          <FormFields
            fields={[{ name: 'status', label: 'Status', type: 'select', options: Object.entries(INVOICE_STATUS_META).map(([value, m]) => ({ value, label: m.label })) }]}
            values={{ status: state.status }}
            onChange={(v) => setState((x) => ({ ...x, status: v.status ?? '', page: 1 }))}
          />
        }
      />
    </>
  );
}
