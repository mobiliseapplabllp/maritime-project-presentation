import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Box, Grid, Typography, Button, Stack, Table, TableHead, TableRow, TableCell, TableBody,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Skeleton, Divider,
} from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import PaidRoundedIcon from '@mui/icons-material/PaidRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { INVOICE_STATUS_META } from '../../utils/status';
import { fmtD, fmtINR, fmtNum } from '../../utils/format';

export default function InvoiceDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [doc, setDoc] = useState(null);
  const [org, setOrg] = useState({});
  const [payDlg, setPayDlg] = useState(false);
  const [payRef, setPayRef] = useState('');
  const [cancelDlg, setCancelDlg] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(`/invoices/${id}`).then((r) => setDoc(r.data))
    .catch((e) => dispatch(notify({ message: e.message, severity: 'error' }))), [id, dispatch]);
  useEffect(() => { load(); api.get('/meta').then((r) => setOrg(r.data.org || {})).catch(() => {}); }, [load]);

  if (!doc) return <Skeleton variant="rounded" height={420} />;
  const err = (e) => dispatch(notify({ message: e.message, severity: 'error' }));

  return (
    <>
      <Box sx={{ displayPrint: 'none' }}>
        <PageHeader
          crumbs={[{ label: 'Invoices', to: '/invoices' }, { label: doc.number }]}
          title={doc.number}
          sub={`${doc.vessel?.name} · Call ${doc.portCall?.vcn || '—'}`}
          actions={
            <>
              <Button variant="outlined" startIcon={<PrintRoundedIcon />} onClick={() => window.print()}>Print</Button>
              {hasPerm(user, 'invoices.issue') && doc.status === 'DRAFT' && (
                <Button variant="contained" startIcon={<SendRoundedIcon />} disabled={busy}
                  onClick={() => { setBusy(true); api.post(`/invoices/${id}/issue`).then(() => { dispatch(notify('Invoice issued')); load(); }).catch(err).finally(() => setBusy(false)); }}>
                  Issue invoice
                </Button>
              )}
              {hasPerm(user, 'invoices.pay') && doc.status === 'ISSUED' && (
                <Button variant="contained" color="success" startIcon={<PaidRoundedIcon />} onClick={() => setPayDlg(true)}>Record payment</Button>
              )}
              {hasPerm(user, 'invoices.issue') && ['DRAFT', 'ISSUED'].includes(doc.status) && (
                <Button variant="outlined" color="error" startIcon={<BlockRoundedIcon />} onClick={() => setCancelDlg(true)}>Cancel</Button>
              )}
            </>
          }
        />
      </Box>

      <Card sx={{ p: { xs: 2.5, md: 4 }, maxWidth: 860, '@media print': { border: 0 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 20 }}>{org.portName || 'Mundra Port'}</Typography>
            <Typography variant="body2" color="text.secondary">{org.operator}</Typography>
            <Typography variant="body2" color="text.secondary">{org.address}</Typography>
            <Typography variant="body2" color="text.secondary">GSTIN: {org.gstin}</Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 13, fontWeight: 600 }}>{doc.number}</Typography>
            <Box sx={{ mt: 0.5 }}><StatusChip value={doc.status} map={INVOICE_STATUS_META} size="medium" /></Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {doc.issuedAt ? `Issued ${fmtD(doc.issuedAt)}` : 'Not yet issued'}
            </Typography>
            {doc.paidAt && <Typography variant="body2" color="success.main">Paid {fmtD(doc.paidAt)} · {doc.paymentRef}</Typography>}
          </Box>
        </Box>
        <Divider sx={{ my: 2.5 }} />
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Typography variant="caption" color="text.secondary">BILLED TO</Typography>
            <Typography sx={{ fontWeight: 700 }}>{doc.billTo?.name}</Typography>
            <Typography variant="body2" color="text.secondary">{doc.billTo?.address}</Typography>
            {doc.billTo?.gstin && <Typography variant="body2" color="text.secondary">GSTIN: {doc.billTo.gstin}</Typography>}
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="caption" color="text.secondary">VESSEL / CALL</Typography>
            <Typography sx={{ fontWeight: 700 }}>{doc.vessel?.name} (IMO {doc.vessel?.imo})</Typography>
            <Typography variant="body2" color="text.secondary">
              Call {doc.portCall?.vcn} · GRT {fmtNum(doc.vessel?.grt)} · Sailed {fmtD(doc.portCall?.atd)}
            </Typography>
          </Grid>
        </Grid>
        <Table size="small" sx={{ mt: 3 }}>
          <TableHead><TableRow>
            <TableCell>Code</TableCell><TableCell>Description</TableCell><TableCell>Unit</TableCell>
            <TableCell align="right">Qty</TableCell><TableCell align="right">Rate</TableCell><TableCell align="right">Amount</TableCell>
          </TableRow></TableHead>
          <TableBody>
            {doc.lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12 }}>{l.code}</TableCell>
                <TableCell>{l.description}</TableCell>
                <TableCell>{l.unit}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(l.qty)}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtINR(l.rate)}</TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtINR(l.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Stack spacing={0.75} sx={{ minWidth: 300 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Subtotal</Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtINR(doc.subtotal)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">IGST @ {doc.gstRate}%</Typography>
              <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtINR(doc.gstAmount)}</Typography>
            </Box>
            <Divider />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontWeight: 700 }}>Total payable</Typography>
              <Typography sx={{ fontWeight: 800, fontFamily: 'Archivo', fontVariantNumeric: 'tabular-nums' }}>{fmtINR(doc.total)}</Typography>
            </Box>
          </Stack>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3 }}>
          Demonstration document — all parties, rates and amounts are fictional sample data.
        </Typography>
      </Card>

      <Dialog open={payDlg} onClose={() => !busy && setPayDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Record payment</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <TextField autoFocus fullWidth label="Payment reference (UTR / NEFT)" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setPayDlg(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" color="success" disabled={busy} onClick={() => {
            setBusy(true);
            api.post(`/invoices/${id}/pay`, { paymentRef: payRef })
              .then(() => { dispatch(notify('Payment recorded')); setPayDlg(false); load(); }).catch(err).finally(() => setBusy(false));
          }}>Mark paid</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={cancelDlg} busy={busy} title="Cancel invoice?" confirmLabel="Cancel invoice"
        message={`${doc.number} will be voided. A fresh invoice can then be generated for the call.`}
        onClose={() => setCancelDlg(false)}
        onConfirm={() => {
          setBusy(true);
          api.post(`/invoices/${id}/cancel`)
            .then(() => { dispatch(notify('Invoice cancelled')); setCancelDlg(false); load(); }).catch(err).finally(() => setBusy(false));
        }}
      />
    </>
  );
}
