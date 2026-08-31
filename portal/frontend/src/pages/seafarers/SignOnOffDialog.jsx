import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Alert, Stack, Chip,
} from '@mui/material';
import DirectionsBoatRoundedIcon from '@mui/icons-material/DirectionsBoatRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import FormFields from '../../components/common/FormFields';

/* Guided crew-change wizard. Sign-on validates documents server-side (medical,
 * CoC) before allowing it — a hard stop unless overridden with a reason.
 * Sign-off writes a verified sea-service record automatically. */

export default function SignOnOffDialog({ seafarer, open, onClose, onDone }) {
  const dispatch = useDispatch();
  const isSignOn = !seafarer?.currentVessel;
  const [vessels, setVessels] = useState([]);
  const [vals, setVals] = useState({});
  const [gate, setGate] = useState(null); // {failures}
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setVals({}); setGate(null); return; }
    if (isSignOn) api.get('/vessels', { params: { status: 'ACTIVE', limit: 200 } }).then((r) => setVessels(r.data)).catch(() => {});
  }, [open, isSignOn]);

  const err = (e) => dispatch(notify({ message: e.message, severity: 'error' }));

  const submit = (override) => {
    setBusy(true);
    const req = isSignOn
      ? api.post(`/seafarers/${seafarer._id}/sign-on`, { vesselId: vals.vesselId, rank: vals.rank || undefined, override, overrideReason: vals.overrideReason })
      : api.post(`/seafarers/${seafarer._id}/sign-off`, { remarks: vals.remarks });
    req.then((r) => {
      dispatch(notify(isSignOn ? `Signed on to ${vessels.find((v) => v._id === vals.vesselId)?.name || 'vessel'}` : `Signed off — ${r.data.seaServiceDays} days added to sea service`));
      onDone(); onClose();
    }).catch((e) => {
      if (e.status === 422) setGate(e.payload?.data || { failures: [e.message] });
      else err(e);
    }).finally(() => setBusy(false));
  };

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {isSignOn ? <DirectionsBoatRoundedIcon sx={{ color: '#75479C' }} /> : <LogoutRoundedIcon sx={{ color: '#75479C' }} />}
        {isSignOn ? 'Sign on to a vessel' : 'Sign off'}
      </DialogTitle>
      <DialogContent sx={{ pt: '12px !important' }}>
        {isSignOn ? (
          <>
            <FormFields
              fields={[
                { name: 'vesselId', label: 'Vessel', type: 'autocomplete', required: true, cols: 12, options: vessels.map((v) => ({ value: v._id, label: `${v.name} — IMO ${v.imo}` })) },
                { name: 'rank', label: 'Sign on as rank (optional — defaults to current)', cols: 12 },
              ]}
              values={vals} onChange={setVals}
            />
            {gate && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 0.5 }}>Document check failed</Typography>
                <Stack spacing={0.25}>{(gate.failures || []).map((f, i) => <Typography key={i} sx={{ fontSize: 12.5 }}>• {f}</Typography>)}</Stack>
                <FormFields fields={[{ name: 'overrideReason', label: 'Reason to override and sign on anyway', cols: 12 }]} values={vals} onChange={setVals} />
              </Alert>
            )}
          </>
        ) : (
          <>
            <Chip label={`Currently on ${seafarer.currentVessel?.name || 'vessel'}`} sx={{ mb: 1.5 }} />
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Signing off closes this tour and adds a verified sea-service record automatically.
            </Typography>
            <FormFields fields={[{ name: 'remarks', label: 'Remarks (optional)', type: 'multiline', cols: 12 }]} values={vals} onChange={setVals} />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="inherit" onClick={onClose} disabled={busy}>Cancel</Button>
        {isSignOn && !gate && (
          <Button variant="contained" disabled={busy || !vals.vesselId} onClick={() => submit(false)}>Check &amp; sign on</Button>
        )}
        {isSignOn && gate && (
          <Button variant="contained" color="error" disabled={busy || !vals.overrideReason} onClick={() => submit(true)}>Override &amp; sign on</Button>
        )}
        {!isSignOn && <Button variant="contained" disabled={busy} onClick={() => submit(false)}>Sign off</Button>}
      </DialogActions>
    </Dialog>
  );
}
