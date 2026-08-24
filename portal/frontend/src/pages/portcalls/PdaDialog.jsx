import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Skeleton,
  Table, TableHead, TableBody, TableRow, TableCell, Divider, Chip, Stack,
} from '@mui/material';
import RequestQuoteRoundedIcon from '@mui/icons-material/RequestQuoteRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { hasPerm } from '../../utils/perms';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { exportPdf } from '../../utils/exportUtils';
import { fmtD } from '../../utils/format';

const nfIN = new Intl.NumberFormat('en-IN');
const rInr = (n) => `₹${nfIN.format(Math.round(n || 0))}`;

/* Proforma Disbursement Account — a pre-arrival cost estimate the agent can
 * carry, then once the call is invoiced, the estimate-vs-actual variance. */

export default function PdaDialog({ callId, open, onClose, user }) {
  const dispatch = useDispatch();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/port-calls/${callId}/pda`).then((r) => setData(r.data))
    .catch((e) => { if (e.status === 404) setData({ pda: null, variance: null }); else dispatch(notify({ message: e.message, severity: 'error' })); });

  useEffect(() => { if (open) load(); else setData(null); }, [open, callId]); // eslint-disable-line

  const generate = () => {
    setBusy(true);
    api.post(`/port-calls/${callId}/pda`)
      .then(() => { dispatch(notify('Cost estimate generated')); load(); })
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
      .finally(() => setBusy(false));
  };

  const download = () => {
    const sections = [{
      heading: 'Estimated charges',
      columns: [
        { key: 'description', label: 'Description' }, { key: 'unit', label: 'Unit' },
        { key: 'qty', label: 'Qty', align: 'right' }, { key: 'rate', label: 'Rate (₹)', align: 'right', value: (r) => r.rate.toFixed(2) },
        { key: 'amount', label: 'Amount', align: 'right', value: (r) => rInr(r.amount) },
      ],
      rows: data.pda.lines,
    }];
    exportPdf({ name: data.pda.number.replace('/', '-'), title: `Proforma Disbursement Account — ${data.pda.number}`, subtitle: `Generated ${fmtD(data.pda.generatedAt)} · GST ${data.pda.gstRate}%`, sections });
  };

  const canGenerate = hasPerm(user, 'invoices.create');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <RequestQuoteRoundedIcon sx={{ color: '#BD3861' }} /> Cost Estimate (PDA)
      </DialogTitle>
      <DialogContent dividers>
        {!data && <Skeleton variant="rounded" height={220} />}
        {data && !data.pda && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography color="text.secondary" sx={{ mb: 2 }}>No cost estimate has been generated for this call yet.</Typography>
            {canGenerate && <Button variant="contained" onClick={generate} disabled={busy}>Generate estimate</Button>}
          </Box>
        )}
        {data && data.pda && (
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontWeight: 700 }}>{data.pda.number}</Typography>
              <Chip size="small" label={`Generated ${fmtD(data.pda.generatedAt)}`} variant="outlined" />
            </Stack>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Description</TableCell>
                  <TableCell align="right" sx={{ fontSize: 11, fontWeight: 700 }}>Qty</TableCell>
                  <TableCell align="right" sx={{ fontSize: 11, fontWeight: 700 }}>Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.pda.lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ fontSize: 12.5 }}>{l.description}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 12.5 }}>{nfIN.format(l.qty)} {l.unit}</TableCell>
                    <TableCell align="right" sx={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums' }}>{rInr(l.amount)}</TableCell>
                  </TableRow>
                ))}
                <TableRow><TableCell colSpan={2} sx={{ fontSize: 12.5 }}>Subtotal</TableCell><TableCell align="right" sx={{ fontSize: 12.5 }}>{rInr(data.pda.subtotal)}</TableCell></TableRow>
                <TableRow><TableCell colSpan={2} sx={{ fontSize: 12.5 }}>GST @ {data.pda.gstRate}%</TableCell><TableCell align="right" sx={{ fontSize: 12.5 }}>{rInr(data.pda.gstAmount)}</TableCell></TableRow>
                <TableRow><TableCell colSpan={2} sx={{ fontSize: 13.5, fontWeight: 800 }}>Estimated total</TableCell><TableCell align="right" sx={{ fontSize: 13.5, fontWeight: 800 }}>{rInr(data.pda.total)}</TableCell></TableRow>
              </TableBody>
            </Table>

            {data.variance && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>Estimate vs. final invoice {data.variance.invoiceNumber}</Typography>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontSize: 10.5, fontWeight: 700 }}>Head</TableCell>
                      <TableCell align="right" sx={{ fontSize: 10.5, fontWeight: 700 }}>Estimated</TableCell>
                      <TableCell align="right" sx={{ fontSize: 10.5, fontWeight: 700 }}>Actual</TableCell>
                      <TableCell align="right" sx={{ fontSize: 10.5, fontWeight: 700 }}>Δ</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.variance.lines.map((l) => (
                      <TableRow key={l.code}>
                        <TableCell sx={{ fontSize: 12 }}>{l.code}</TableCell>
                        <TableCell align="right" sx={{ fontSize: 12 }}>{rInr(l.estimated)}</TableCell>
                        <TableCell align="right" sx={{ fontSize: 12 }}>{rInr(l.actual)}</TableCell>
                        <TableCell align="right" sx={{ fontSize: 12, fontWeight: 700, color: l.delta > 0 ? 'error.main' : l.delta < 0 ? 'success.main' : 'text.secondary' }}>
                          {l.delta > 0 ? '+' : ''}{rInr(l.delta)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell sx={{ fontSize: 13, fontWeight: 800 }}>Total</TableCell>
                      <TableCell align="right" sx={{ fontSize: 13, fontWeight: 800 }}>{rInr(data.variance.estimatedTotal)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: 13, fontWeight: 800 }}>{rInr(data.variance.actualTotal)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: 13, fontWeight: 800, color: data.variance.delta > 0 ? 'error.main' : 'success.main' }}>
                        {data.variance.delta > 0 ? '+' : ''}{rInr(data.variance.delta)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </>
            )}
            {!data.variance && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>Variance appears once this call has an issued invoice.</Typography>}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">Close</Button>
        {data && data.pda && canGenerate && <Button startIcon={<RefreshRoundedIcon />} onClick={generate} disabled={busy}>Regenerate</Button>}
        {data && data.pda && <Button variant="contained" startIcon={<PictureAsPdfRoundedIcon />} onClick={download}>Download PDF</Button>}
      </DialogActions>
    </Dialog>
  );
}
