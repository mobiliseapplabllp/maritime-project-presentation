import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Skeleton, Stack, Chip,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import FormFields from '../../components/common/FormFields';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { CERT_STATUS_META, PORTCALL_STATUS_META, INSPECTION_STATUS_META, RESULT_META } from '../../utils/status';
import { fmtD, fmtDT, fmtNum, toInputD } from '../../utils/format';

const Item = ({ label, value }) => (
  <Box>
    <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>{label}</Typography>
    <Typography component="div" sx={{ fontSize: 14, fontWeight: 600, mt: 0.25 }}>{value ?? '—'}</Typography>
  </Box>
);

const CERT_TYPES = ['Certificate of Registry', 'Classification Certificate', 'Safety Management Certificate',
  'International Ship Security Certificate', 'IOPP Certificate', 'Load Line Certificate', 'Maritime Labour Certificate',
  'Safety Equipment Certificate', 'Safety Radio Certificate', 'Tonnage Certificate'];

export default function VesselDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [v, setV] = useState(null);
  const [tab, setTab] = useState(0);
  const [certDlg, setCertDlg] = useState(null);   // {} new | cert
  const [certVals, setCertVals] = useState({});
  const [delCert, setDelCert] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(`/vessels/${id}`).then((r) => setV(r.data))
    .catch((e) => dispatch(notify({ message: e.message, severity: 'error' }))), [id, dispatch]);
  useEffect(() => { load(); }, [load]);

  if (!v) return <Skeleton variant="rounded" height={420} />;
  const canCerts = hasPerm(user, 'certificates.manage');
  const err = (e) => dispatch(notify({ message: e.message, severity: 'error' }));

  const saveCert = () => {
    setBusy(true);
    const body = { ...certVals };
    const req = certDlg?._id
      ? api.put(`/vessels/${id}/certificates/${certDlg._id}`, body)
      : api.post(`/vessels/${id}/certificates`, body);
    req.then(() => { dispatch(notify('Certificate saved')); setCertDlg(null); load(); }).catch(err).finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Vessels', to: '/vessels' }, { label: v.name }]}
        title={v.name}
        sub={`IMO ${v.imo} · ${v.type} · ${v.flag} flag · Class ${v.classSociety || '—'}`}
      />
      <Card sx={{ p: 2.5, mb: 2 }}>
        <Grid container spacing={2.5}>
          <Grid item xs={6} md={2}><Item label="GRT / DWT" value={`${fmtNum(v.grt)} / ${fmtNum(v.dwt)}`} /></Grid>
          <Grid item xs={6} md={2}><Item label="LOA × Beam" value={`${v.loa || '—'} × ${v.beam || '—'} m`} /></Grid>
          <Grid item xs={6} md={2}><Item label="Max draft" value={v.maxDraft ? `${v.maxDraft} m` : '—'} /></Grid>
          <Grid item xs={6} md={2}><Item label="Built" value={v.built} /></Grid>
          <Grid item xs={6} md={2}><Item label="MMSI / Call sign" value={`${v.mmsi || '—'} · ${v.callSign || '—'}`} /></Grid>
          <Grid item xs={6} md={2}><Item label="Agent" value={v.agent} /></Grid>
          <Grid item xs={12} md={6}><Item label="Registered owner" value={v.owner} /></Grid>
          <Grid item xs={12} md={6}><Item label="Registry status" value={<Chip size="small" label={v.status} color={v.status === 'ACTIVE' ? 'success' : 'default'} sx={{ height: 20 }} />} /></Grid>
        </Grid>
      </Card>

      <Card>
        <Tabs value={tab} onChange={(_, t) => setTab(t)} sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={`Certificates (${v.certificates.length})`} />
          <Tab label={`Port calls (${v.recentCalls.length})`} />
          <Tab label={`Inspections (${v.recentInspections.length})`} />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ p: 2 }}>
            {canCerts && (
              <Button size="small" startIcon={<AddRoundedIcon />} sx={{ mb: 1 }}
                onClick={() => { setCertVals({}); setCertDlg({}); }}>Add certificate</Button>
            )}
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Certificate</TableCell><TableCell>Number</TableCell><TableCell>Issuer</TableCell>
                <TableCell>Issued</TableCell><TableCell>Expires</TableCell><TableCell>Status</TableCell><TableCell />
              </TableRow></TableHead>
              <TableBody>
                {v.certificates.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell><b>{c.certType}</b></TableCell>
                    <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12 }}>{c.number || '—'}</TableCell>
                    <TableCell>{c.issuer || '—'}</TableCell>
                    <TableCell>{fmtD(c.issueDate)}</TableCell><TableCell>{fmtD(c.expiryDate)}</TableCell>
                    <TableCell><StatusChip value={c.status} map={CERT_STATUS_META} /></TableCell>
                    <TableCell align="right">
                      {canCerts && (
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <IconButton size="small" onClick={() => {
                            setCertVals({ certType: c.certType, number: c.number, issuer: c.issuer, issueDate: toInputD(c.issueDate), expiryDate: toInputD(c.expiryDate), remarks: c.remarks });
                            setCertDlg(c);
                          }}><EditRoundedIcon fontSize="inherit" /></IconButton>
                          <IconButton size="small" color="error" onClick={() => setDelCert(c)}><DeleteOutlineRoundedIcon fontSize="inherit" /></IconButton>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}

        {tab === 1 && (
          <Table size="small" sx={{ m: 0 }}>
            <TableHead><TableRow><TableCell>VCN</TableCell><TableCell>Status</TableCell><TableCell>ETA</TableCell><TableCell>Berth</TableCell><TableCell>Sailed</TableCell></TableRow></TableHead>
            <TableBody>
              {v.recentCalls.map((c) => (
                <TableRow key={c._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/port-calls/${c._id}`)}>
                  <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5 }}>{c.vcn}</TableCell>
                  <TableCell><StatusChip value={c.status} map={PORTCALL_STATUS_META} /></TableCell>
                  <TableCell>{fmtDT(c.eta)}</TableCell>
                  <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5 }}>{c.berth?.code || '—'}</TableCell>
                  <TableCell>{fmtDT(c.atd)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {tab === 2 && (
          <Table size="small">
            <TableHead><TableRow><TableCell>Number</TableCell><TableCell>Type</TableCell><TableCell>Status</TableCell><TableCell>Result</TableCell><TableCell>Findings</TableCell><TableCell>Date</TableCell></TableRow></TableHead>
            <TableBody>
              {v.recentInspections.map((i) => (
                <TableRow key={i._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/inspections/${i._id}`)}>
                  <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5 }}>{i.number}</TableCell>
                  <TableCell>{i.type}</TableCell>
                  <TableCell><StatusChip value={i.status} map={INSPECTION_STATUS_META} /></TableCell>
                  <TableCell>{i.result ? <StatusChip value={i.result} map={RESULT_META} /> : '—'}</TableCell>
                  <TableCell>{i.findings?.length || 0}</TableCell>
                  <TableCell>{fmtD(i.plannedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={!!certDlg} onClose={() => !busy && setCertDlg(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{certDlg?._id ? 'Edit certificate' : 'Add certificate'}</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <FormFields
            fields={[
              { name: 'certType', label: 'Certificate type', type: 'autocomplete', required: true, cols: 12, options: CERT_TYPES.map((c) => ({ value: c, label: c })) },
              { name: 'number', label: 'Number' }, { name: 'issuer', label: 'Issuer' },
              { name: 'issueDate', label: 'Issue date', type: 'date' }, { name: 'expiryDate', label: 'Expiry date', type: 'date', required: true },
              { name: 'remarks', label: 'Remarks', cols: 12 },
            ]}
            values={certVals} onChange={setCertVals}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setCertDlg(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={saveCert} disabled={busy || !certVals.certType || !certVals.expiryDate}>Save</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={!!delCert} busy={busy} title="Delete certificate?"
        message={`Remove ${delCert?.certType} from ${v.name}? The deletion is recorded in the audit log.`}
        onClose={() => setDelCert(null)}
        onConfirm={() => {
          setBusy(true);
          api.delete(`/vessels/${id}/certificates/${delCert._id}`)
            .then(() => { dispatch(notify('Certificate deleted')); setDelCert(null); load(); }).catch(err).finally(() => setBusy(false));
        }}
      />
    </>
  );
}
