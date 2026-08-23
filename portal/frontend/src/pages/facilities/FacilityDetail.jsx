import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Button, Stack, Table, TableHead, TableRow, TableCell, TableBody,
  Skeleton, Chip, Rating, Divider, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import FormFields from '../../components/common/FormFields';
import { fmtD, fmtDT } from '../../utils/format';
import { LICENSE_STATUS_META, licLabel } from './FacilitiesList';

const Item = ({ label, value }) => (
  <Box>
    <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>{label}</Typography>
    <Typography component="div" sx={{ fontSize: 14, fontWeight: 600, mt: 0.25 }}>{value ?? '—'}</Typography>
  </Box>
);

const ACTIONS = {
  APPLIED: [{ to: 'UNDER_REVIEW', label: 'Start review' }, { to: 'REJECTED', label: 'Reject', danger: true }],
  UNDER_REVIEW: [{ to: 'ISSUED', label: 'Issue licence' }, { to: 'REJECTED', label: 'Reject', danger: true }],
  ISSUED: [{ to: 'SUSPENDED', label: 'Suspend', danger: true }, { to: 'REVOKED', label: 'Revoke', danger: true }],
  SUSPENDED: [{ to: 'ISSUED', label: 'Reinstate' }, { to: 'REVOKED', label: 'Revoke', danger: true }],
  REJECTED: [], REVOKED: [],
};

export default function FacilityDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [doc, setDoc] = useState(null);
  const [action, setAction] = useState(null);
  const [vals, setVals] = useState({});
  const [auditDlg, setAuditDlg] = useState(false);
  const [auditVals, setAuditVals] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(`/licenses/${id}`).then((r) => setDoc(r.data))
    .catch((e) => dispatch(notify({ message: e.message, severity: 'error' }))), [id, dispatch]);
  useEffect(() => { load(); }, [load]);

  if (!doc) return <Skeleton variant="rounded" height={420} />;
  const err = (e) => dispatch(notify({ message: e.message, severity: 'error' }));
  const canApprove = hasPerm(user, 'facilities.approve');
  const canManage = hasPerm(user, 'facilities.manage');
  const [statusLabel, statusColor] = LICENSE_STATUS_META[doc.status] || [doc.status, 'default'];

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Facilities & companies', to: '/facilities' }, { label: doc.licenseNo }]}
        title={doc.entityName}
        sub={`${doc.licenseNo} · ${licLabel(doc.entityType)}`}
        actions={canApprove && (ACTIONS[doc.status] || []).map((a) => (
          <Button key={a.to} variant={a.danger ? 'outlined' : 'contained'} color={a.danger ? 'error' : 'primary'}
            onClick={() => { setVals({}); setAction(a); }}>{a.label}</Button>
        ))}
      />
      <Card sx={{ p: 2.5, mb: 2 }}>
        <Grid container spacing={2.5}>
          <Grid item xs={6} md={2}><Item label="Status" value={<Chip size="small" label={statusLabel} color={statusColor} sx={{ height: 21 }} variant={statusColor === 'default' ? 'outlined' : 'filled'} />} /></Grid>
          <Grid item xs={6} md={2}><Item label="Applied" value={fmtD(doc.appliedDate)} /></Grid>
          <Grid item xs={6} md={2}><Item label="Issued" value={fmtD(doc.issueDate)} /></Grid>
          <Grid item xs={6} md={2}><Item label="Expires" value={fmtD(doc.expiryDate)} /></Grid>
          <Grid item xs={6} md={2}><Item label="Performance" value={doc.performanceRating ? <Rating value={doc.performanceRating} precision={0.5} size="small" readOnly /> : 'Not rated'} /></Grid>
          <Grid item xs={6} md={2}><Item label="Contact" value={doc.contactPerson} /></Grid>
          <Grid item xs={12} md={6}><Item label="Address" value={doc.address} /></Grid>
          <Grid item xs={6} md={3}><Item label="GSTIN" value={doc.gstin} /></Grid>
          <Grid item xs={6} md={3}><Item label="Conditions" value={doc.conditions || '—'} /></Grid>
        </Grid>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontSize: 15 }}>Audit history ({doc.audits.length})</Typography>
              {canManage && ['ISSUED', 'SUSPENDED'].includes(doc.status) && (
                <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => { setAuditVals({ date: new Date().toISOString().slice(0, 10), auditor: user.name }); setAuditDlg(true); }}>Record audit</Button>
              )}
            </Box>
            <Divider />
            <Table size="small">
              <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Auditor</TableCell><TableCell>Result</TableCell><TableCell>Remarks</TableCell></TableRow></TableHead>
              <TableBody>
                {doc.audits.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell>{fmtD(a.date)}</TableCell><TableCell>{a.auditor}</TableCell>
                    <TableCell><Chip size="small" label={a.result.replace(/_/g, ' ')} color={a.result === 'SATISFACTORY' ? 'success' : a.result === 'OBSERVATIONS' ? 'warning' : 'error'} variant="outlined" sx={{ height: 21, fontSize: 10.5 }} /></TableCell>
                    <TableCell>{a.remarks || '—'}</TableCell>
                  </TableRow>
                ))}
                {doc.audits.length === 0 && <TableRow><TableCell colSpan={4}><Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>No audits recorded</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </Grid>
        <Grid item xs={12} md={5}>
          <Card sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ fontSize: 15, mb: 1.5 }}>Lifecycle</Typography>
            <Stack spacing={0}>
              {[...doc.history].reverse().map((h, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 2 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: i === 0 ? 'primary.main' : 'divider', mt: 0.75 }} />
                    {i < doc.history.length - 1 && <Box sx={{ width: 2, flex: 1, bgcolor: 'divider' }} />}
                  </Box>
                  <Box sx={{ pb: 2 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{(LICENSE_STATUS_META[h.to] || [h.to])[0]}</Typography>
                    <Typography variant="caption" color="text.secondary">{fmtDT(h.at)} · {h.by}{h.note ? ` · ${h.note}` : ''}</Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={!!action} onClose={() => !busy && setAction(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{action?.label} — {doc.entityName}</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <FormFields
            fields={[
              ...(action?.to === 'ISSUED' && doc.status === 'UNDER_REVIEW' ? [{ name: 'expiryDate', label: 'Valid until', type: 'date', cols: 12, helper: 'Defaults to 2 years if left blank' }] : []),
              ...(['SUSPENDED', 'REVOKED', 'REJECTED'].includes(action?.to) ? [{ name: 'note', label: 'Reason', type: 'multiline', required: true, cols: 12 }] : [{ name: 'note', label: 'Note (optional)', type: 'multiline', cols: 12 }]),
            ]}
            values={vals} onChange={setVals}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" color={action?.danger ? 'error' : 'primary'}
            disabled={busy || (['SUSPENDED', 'REVOKED', 'REJECTED'].includes(action?.to) && !vals.note)}
            onClick={() => {
              setBusy(true);
              api.post(`/licenses/${id}/transition`, { to: action.to, note: vals.note, expiryDate: vals.expiryDate })
                .then(() => { dispatch(notify(`${action.label} — done`)); setAction(null); load(); }).catch(err).finally(() => setBusy(false));
            }}>Confirm</Button>
        </DialogActions>
      </Dialog>
      <Dialog open={auditDlg} onClose={() => !busy && setAuditDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Record audit</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <FormFields
            fields={[
              { name: 'date', label: 'Audit date', type: 'date', required: true },
              { name: 'auditor', label: 'Auditor', required: true },
              { name: 'result', label: 'Result', type: 'select', required: true, cols: 12, options: ['SATISFACTORY', 'OBSERVATIONS', 'NON_CONFORMITY'].map((r) => ({ value: r, label: r.replace(/_/g, ' ') })) },
              { name: 'remarks', label: 'Remarks', type: 'multiline', cols: 12 },
            ]}
            values={auditVals} onChange={setAuditVals}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setAuditDlg(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" disabled={busy || !auditVals.date || !auditVals.auditor || !auditVals.result}
            onClick={() => {
              setBusy(true);
              api.post(`/licenses/${id}/audits`, auditVals)
                .then(() => { dispatch(notify('Audit recorded')); setAuditDlg(false); load(); }).catch(err).finally(() => setBusy(false));
            }}>Save</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
