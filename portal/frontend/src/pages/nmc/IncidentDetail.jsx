import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Button, Stack, Skeleton, Chip, Divider, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import { fmtDT } from '../../utils/format';
import { INC_STATUS_META, SEV_META } from './IncidentsList';

export default function IncidentDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [doc, setDoc] = useState(null);
  const [entry, setEntry] = useState('');
  const [closeDlg, setCloseDlg] = useState(false);
  const [outcome, setOutcome] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(`/incidents/${id}`).then((r) => setDoc(r.data))
    .catch((e) => dispatch(notify({ message: e.message, severity: 'error' }))), [id, dispatch]);
  useEffect(() => { load(); }, [load]);

  if (!doc) return <Skeleton variant="rounded" height={420} />;
  const err = (e) => dispatch(notify({ message: e.message, severity: 'error' }));
  const canManage = hasPerm(user, 'nmc.manage');
  const open = doc.status !== 'CLOSED';
  const [sLabel, sColor] = INC_STATUS_META[doc.status];
  const [vLabel, vColor] = SEV_META[doc.severity];

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Incidents & SAR', to: '/nmc/incidents' }, { label: doc.number }]}
        title={doc.title}
        sub={`${doc.number} · ${doc.type.replace(/_/g, ' ')} · reported ${fmtDT(doc.reportedAt)} by ${doc.reportedBy || '—'}`}
        actions={canManage && open && (
          <Button variant="contained" startIcon={<TaskAltRoundedIcon />} onClick={() => setCloseDlg(true)}>Close incident</Button>
        )}
      />
      <Card sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip label={sLabel} color={sColor} size="small" />
          <Chip label={`Severity: ${vLabel}`} color={vColor} size="small" variant={vColor === 'default' ? 'outlined' : 'filled'} />
          {(doc.vessel?.name || doc.vesselName) && <Chip variant="outlined" size="small" label={doc.vessel?.name || doc.vesselName} />}
          {doc.position?.lat && <Chip variant="outlined" size="small" label={`${doc.position.lat.toFixed(3)}°N ${doc.position.lon.toFixed(3)}°E`} sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 11 }} />}
          {doc.assets?.length > 0 && <Chip variant="outlined" size="small" label={`Assets: ${doc.assets.join(', ')}`} />}
          {doc.closedAt && <Chip variant="outlined" size="small" label={`Closed ${fmtDT(doc.closedAt)}`} />}
        </Stack>
        {doc.outcome && (
          <Typography sx={{ mt: 1.5, fontSize: 13.5 }}><b>Outcome:</b> {doc.outcome}</Typography>
        )}
      </Card>
      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Card>
            <Box sx={{ px: 2, py: 1.5 }}><Typography variant="h6" sx={{ fontSize: 15 }}>Operations log</Typography></Box>
            <Divider />
            <Stack spacing={0} sx={{ p: 2.5 }}>
              {[...doc.log].reverse().map((l, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 2 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: i === 0 ? 'primary.main' : 'divider', mt: 0.75 }} />
                    {i < doc.log.length - 1 && <Box sx={{ width: 2, flex: 1, bgcolor: 'divider' }} />}
                  </Box>
                  <Box sx={{ pb: 2.25 }}>
                    <Typography sx={{ fontSize: 13.5 }}>{l.entry}</Typography>
                    <Typography variant="caption" color="text.secondary">{fmtDT(l.at)} · {l.by}</Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
            {canManage && open && (
              <>
                <Divider />
                <Box sx={{ p: 2, display: 'flex', gap: 1 }}>
                  <TextField fullWidth size="small" placeholder="Add log entry…" value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && entry.trim()) { api.post(`/incidents/${id}/log`, { entry }).then(() => { setEntry(''); load(); }).catch(err); } }} />
                  <Button variant="contained" disabled={!entry.trim()}
                    onClick={() => api.post(`/incidents/${id}/log`, { entry }).then(() => { setEntry(''); load(); }).catch(err)}>Log</Button>
                </Box>
              </>
            )}
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card sx={{ p: 2 }}>
            <Typography variant="h6" sx={{ fontSize: 15, mb: 1 }}>Response doctrine</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
              {doc.type === 'SAR' && 'SAR coordination follows the IAMSAR framework: distress phase declared, on-scene coordinator designated, Coast Guard MRCC informed. Every asset tasking and sighting goes in the log.'}
              {doc.type === 'POLLUTION' && 'Tier-1 response under the port oil-spill contingency plan: containment boom first, source isolation, sampling for evidence, and State PCB notification within the statutory window.'}
              {doc.type === 'SECURITY' && 'ISPS response: PFSO leads, security level reviewed, access records preserved, and CISF informed where force response is needed.'}
              {doc.type === 'CASUALTY' && 'Marine casualty handling: preserve evidence, collect statements while fresh, notify MMD, and feed findings back into berth SOPs and the risk model.'}
              {doc.type === 'MEDICAL_EVAC' && 'Medevac protocol: port health advised, receiving hospital confirmed before launch departure, and the master provides the medical log extract.'}
              {doc.type === 'NEAR_MISS' && 'Near-miss capture feeds the safety system: no blame recording, causal factors tagged, trends reviewed monthly at the safety committee.'}
            </Typography>
          </Card>
        </Grid>
      </Grid>
      <Dialog open={closeDlg} onClose={() => !busy && setCloseDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Close {doc.number}</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <TextField autoFocus fullWidth multiline minRows={3} label="Outcome summary" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setCloseDlg(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" disabled={busy || !outcome.trim()} onClick={() => {
            setBusy(true);
            api.post(`/incidents/${id}/close`, { outcome })
              .then(() => { dispatch(notify('Incident closed')); setCloseDlg(false); load(); }).catch(err).finally(() => setBusy(false));
          }}>Close incident</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
