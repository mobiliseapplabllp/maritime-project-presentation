import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Box, Card, TextField, Button, Typography, Alert, Chip, Stack, InputAdornment, IconButton } from '@mui/material';
import AnchorRoundedIcon from '@mui/icons-material/AnchorRounded';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import api from '../api/client';
import { setSession } from '../store/authSlice';

const SAMPLE = [
  ['admin@mundraport.in', 'Super Admin'],
  ['harbour@mundraport.in', 'Harbour Master'],
  ['surveyor@mundraport.in', 'Marine Surveyor'],
  ['finance@mundraport.in', 'Finance Officer'],
  ['agent@mundraport.in', 'Shipping Agent'],
];

export default function Login() {
  const dispatch = useDispatch();
  const [email, setEmail] = useState('admin@mundraport.in');
  const [password, setPassword] = useState('Mundra@2026');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    api.post('/auth/login', { email, password })
      .then((r) => dispatch(setSession(r.data)))
      .catch((err) => setError(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '5fr 4fr' } }}>
      <Box sx={{
        display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'space-between',
        p: 6, color: '#DCE7EA', bgcolor: '#0B1F2A',
        backgroundImage: 'radial-gradient(ellipse at 20% 110%, rgba(14,124,134,0.35), transparent 55%), radial-gradient(ellipse at 95% -10%, rgba(169,111,18,0.18), transparent 45%)',
      }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Box sx={{ width: 42, height: 42, borderRadius: '11px', bgcolor: '#0E7C86', display: 'grid', placeItems: 'center' }}>
            <AnchorRoundedIcon sx={{ color: '#fff' }} />
          </Box>
          <Box>
            <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 18, color: '#fff' }}>Mundra Port</Typography>
            <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10, letterSpacing: '0.16em', color: '#7FA0AC' }}>
              OPERATIONS PORTAL · IN MUN
            </Typography>
          </Box>
        </Box>
        <Box>
          <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 42, lineHeight: 1.05, color: '#fff', letterSpacing: '-0.02em', maxWidth: 460 }}>
            One port.<br />One operating picture.
          </Typography>
          <Typography sx={{ mt: 2, maxWidth: 440, color: '#AAC1C7', fontSize: 15, lineHeight: 1.6 }}>
            Port calls, berthing, cargo, inspections and billing on a single registry —
            with every action on the record.
          </Typography>
        </Box>
        <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10.5, color: '#5F8291', letterSpacing: '0.06em' }}>
          DEMONSTRATION SYSTEM — ALL DATA FICTIONAL · MOBILISE APP LAB
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'background.default' }}>
        <Card sx={{ p: 4, width: 420, maxWidth: '100%' }}>
          <Typography variant="h5" gutterBottom>Sign in</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Use a sample account below — password is <b>Mundra@2026</b> for all of them.
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          <form onSubmit={submit}>
            <Stack spacing={2}>
              <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus fullWidth />
              <TextField
                label="Password" type={show ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)} fullWidth
                InputProps={{ endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={() => setShow(!show)} edge="end" size="small">
                      {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ) }}
              />
              <Button type="submit" variant="contained" size="large" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
            </Stack>
          </form>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 3, mb: 1 }}>
            Sample accounts (click to fill)
          </Typography>
          <Stack direction="row" flexWrap="wrap" gap={0.75}>
            {SAMPLE.map(([mail, role]) => (
              <Chip key={mail} size="small" label={role} variant={email === mail ? 'filled' : 'outlined'}
                color={email === mail ? 'primary' : 'default'} onClick={() => setEmail(mail)} />
            ))}
          </Stack>
        </Card>
      </Box>
    </Box>
  );
}
