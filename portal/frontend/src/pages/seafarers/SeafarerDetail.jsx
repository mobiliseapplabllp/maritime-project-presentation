import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody,
  Button, IconButton, Skeleton, Chip, Stack,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import VerifiedRoundedIcon from '@mui/icons-material/VerifiedRounded';
import DirectionsBoatRoundedIcon from '@mui/icons-material/DirectionsBoatRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import SignOnOffDialog from './SignOnOffDialog';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import FormFields from '../../components/common/FormFields';
import FormDrawer from '../../components/common/FormDrawer';
import { CERT_STATUS_META } from '../../utils/status';
import { fmtD, fmtNum, toInputD } from '../../utils/format';

const Item = ({ label, value }) => (
  <Box>
    <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>{label}</Typography>
    <Typography component="div" sx={{ fontSize: 14, fontWeight: 600, mt: 0.25 }}>{value ?? '—'}</Typography>
  </Box>
);

export default function SeafarerDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [doc, setDoc] = useState(null);
  const [tab, setTab] = useState(0);
  const [certDlg, setCertDlg] = useState(null);
  const [certVals, setCertVals] = useState({});
  const [svcDlg, setSvcDlg] = useState(false);
  const [svcVals, setSvcVals] = useState({});
  const [certTypes, setCertTypes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [signDlg, setSignDlg] = useState(false);

  const load = useCallback(() => api.get(`/seafarers/${id}`).then((r) => setDoc(r.data))
    .catch((e) => dispatch(notify({ message: e.message, severity: 'error' }))), [id, dispatch]);
  useEffect(() => { load(); api.get('/meta').then((r) => setCertTypes(r.data.seafarerCertTypes || [])).catch(() => {}); }, [load]);

  if (!doc) return <Skeleton variant="rounded" height={420} />;
  const canEdit = hasPerm(user, 'seafarers.edit');
  const err = (e) => dispatch(notify({ message: e.message, severity: 'error' }));

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Seafarers', to: '/seafarers' }, { label: doc.name }]}
        title={doc.name}
        sub={`${doc.rank} · CDC ${doc.cdcNo} · INDoS ${doc.indosNo || '—'} · ${doc.nationality}`}
        actions={canEdit && (
          doc.currentVessel
            ? <Button variant="outlined" color="inherit" startIcon={<LogoutRoundedIcon />} onClick={() => setSignDlg(true)}>Sign off</Button>
            : <Button variant="contained" startIcon={<DirectionsBoatRoundedIcon />} onClick={() => setSignDlg(true)}>Sign on to a vessel</Button>
        )}
      />
      <SignOnOffDialog seafarer={doc} open={signDlg} onClose={() => setSignDlg(false)} onDone={load} />
      <Card sx={{ p: 2.5, mb: 2 }}>
        <Grid container spacing={2.5}>
          <Grid item xs={6} md={2}><Item label="Status" value={<Chip size="small" label={doc.status.replace(/_/g, ' ')} color={doc.status === 'ACTIVE' ? 'success' : 'default'} sx={{ height: 20 }} />} /></Grid>
          <Grid item xs={6} md={2}><Item label="Date of birth" value={fmtD(doc.dob)} /></Grid>
          <Grid item xs={6} md={2}><Item label="Total sea days" value={fmtNum(doc.totalSeaDays)} /></Grid>
          <Grid item xs={6} md={2}><Item label="Current vessel" value={doc.currentVessel?.name || 'Ashore'} /></Grid>
          <Grid item xs={6} md={2}><Item label="Phone" value={doc.phone} /></Grid>
          <Grid item xs={6} md={2}><Item label="Certificate alerts" value={doc.certAlerts ? <Chip size="small" color="warning" label={`${doc.certAlerts} to review`} sx={{ height: 20 }} /> : 'None'} /></Grid>
        </Grid>
      </Card>

      <Card>
        <Tabs value={tab} onChange={(_, t) => setTab(t)} sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={`Certificates (${doc.certificates.length})`} />
          <Tab label={`Sea service (${doc.seaService.length})`} />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ p: 2 }}>
            {canEdit && <Button size="small" startIcon={<AddRoundedIcon />} sx={{ mb: 1 }} onClick={() => { setCertVals({ issuer: 'DG Shipping, India' }); setCertDlg({}); }}>Add certificate</Button>}
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Certificate</TableCell><TableCell>Grade</TableCell><TableCell>Number</TableCell>
                <TableCell>Issuer</TableCell><TableCell>Expires</TableCell><TableCell>Status</TableCell><TableCell />
              </TableRow></TableHead>
              <TableBody>
                {doc.certificates.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell><b>{c.certType}</b></TableCell>
                    <TableCell>{c.grade || '—'}</TableCell>
                    <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12 }}>{c.number || '—'}</TableCell>
                    <TableCell>{c.issuer}</TableCell>
                    <TableCell>{fmtD(c.expiryDate)}</TableCell>
                    <TableCell><StatusChip value={c.status} map={CERT_STATUS_META} /></TableCell>
                    <TableCell align="right">
                      {canEdit && (
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <IconButton size="small" onClick={() => { setCertVals({ certType: c.certType, grade: c.grade, number: c.number, issuer: c.issuer, issueDate: toInputD(c.issueDate), expiryDate: toInputD(c.expiryDate) }); setCertDlg(c); }}><EditRoundedIcon fontSize="inherit" /></IconButton>
                          <IconButton size="small" color="error" onClick={() => api.delete(`/seafarers/${id}/certificates/${c._id}`).then(load).catch(err)}><DeleteOutlineRoundedIcon fontSize="inherit" /></IconButton>
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
          <Box sx={{ p: 2 }}>
            {canEdit && <Button size="small" startIcon={<AddRoundedIcon />} sx={{ mb: 1 }} onClick={() => { setSvcVals({ rank: doc.rank }); setSvcDlg(true); }}>Add sea service</Button>}
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Vessel</TableCell><TableCell>IMO</TableCell><TableCell>Rank</TableCell>
                <TableCell>Signed on</TableCell><TableCell>Signed off</TableCell><TableCell align="right">Days</TableCell><TableCell>Verified</TableCell><TableCell />
              </TableRow></TableHead>
              <TableBody>
                {doc.seaService.map((sv) => (
                  <TableRow key={sv._id}>
                    <TableCell><b>{sv.vesselName}</b></TableCell>
                    <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12 }}>{sv.imo || '—'}</TableCell>
                    <TableCell>{sv.rank}</TableCell>
                    <TableCell>{fmtD(sv.from)}</TableCell><TableCell>{fmtD(sv.to)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round((new Date(sv.to) - new Date(sv.from)) / 86400000)}</TableCell>
                    <TableCell>{sv.verified ? <Chip size="small" icon={<VerifiedRoundedIcon sx={{ fontSize: 14 }} />} label="Verified" color="success" variant="outlined" sx={{ height: 21, fontSize: 10.5 }} /> : <Chip size="small" label="Declared" variant="outlined" sx={{ height: 21, fontSize: 10.5 }} />}</TableCell>
                    <TableCell align="right">
                      {canEdit && <IconButton size="small" color="error" onClick={() => api.delete(`/seafarers/${id}/service/${sv._id}`).then(load).catch(err)}><DeleteOutlineRoundedIcon fontSize="inherit" /></IconButton>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>

      <FormDrawer
        open={!!certDlg} title={certDlg?._id ? 'Edit certificate' : 'Add certificate'} subtitle={doc.name}
        onClose={() => setCertDlg(null)} busy={busy} disabled={!certVals.certType || !certVals.expiryDate}
        onSubmit={() => {
          setBusy(true);
          const req = certDlg?._id ? api.put(`/seafarers/${id}/certificates/${certDlg._id}`, certVals) : api.post(`/seafarers/${id}/certificates`, certVals);
          req.then(() => { dispatch(notify('Certificate saved')); setCertDlg(null); load(); }).catch(err).finally(() => setBusy(false));
        }}>
        <FormFields
          fields={[
            { name: 'certType', label: 'Certificate type', type: 'autocomplete', required: true, cols: 12, options: certTypes.map((c) => ({ value: c, label: c })) },
            { name: 'grade', label: 'Grade / class' }, { name: 'number', label: 'Number' },
            { name: 'issuer', label: 'Issuer' },
            { name: 'issueDate', label: 'Issue date', type: 'date' }, { name: 'expiryDate', label: 'Expiry date', type: 'date', required: true },
          ]}
          values={certVals} onChange={setCertVals}
        />
      </FormDrawer>
      <FormDrawer
        open={svcDlg} title="Add sea service" subtitle={`${doc.name} — service is cross-checked against movement records`}
        onClose={() => setSvcDlg(false)} busy={busy} disabled={!svcVals.vesselName || !svcVals.from || !svcVals.to}
        onSubmit={() => {
          setBusy(true);
          api.post(`/seafarers/${id}/service`, svcVals)
            .then(() => { dispatch(notify('Sea service added')); setSvcDlg(false); load(); }).catch(err).finally(() => setBusy(false));
        }}>
        <FormFields
          fields={[
            { name: 'vesselName', label: 'Vessel name', required: true }, { name: 'imo', label: 'IMO number' },
            { name: 'rank', label: 'Rank served', required: true },
            { name: 'verified', label: 'Verified against records', type: 'switch' },
            { name: 'from', label: 'Signed on', type: 'date', required: true }, { name: 'to', label: 'Signed off', type: 'date', required: true },
            { name: 'remarks', label: 'Remarks', type: 'multiline', cols: 12 },
          ]}
          values={svcVals} onChange={setSvcVals}
        />
      </FormDrawer>
    </>
  );
}
