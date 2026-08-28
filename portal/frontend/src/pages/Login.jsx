import { useState } from 'react';
import { useDispatch } from 'react-redux';
import {
  Box, Card, TextField, Button, Typography, Alert, Stack, InputAdornment, IconButton,
  ButtonBase, Divider, Chip, CircularProgress,
} from '@mui/material';
import AnchorRoundedIcon from '@mui/icons-material/AnchorRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import api from '../api/client';
import { setSession } from '../store/authSlice';
import { BRAND_GRADIENT } from '../theme';
import PortScene from '../components/PortScene';
import PlatformWordmark from '../components/brand/PlatformWordmark';
import MobiliseMark from '../components/brand/MobiliseMark';

const ROLES = [
  { email: 'admin@maritime.example', role: 'Super Admin', who: 'Port administrator — every module' },
  { email: 'harbour@maritime.example', role: 'Harbour Master', who: 'Port calls, berthing, cargo operations' },
  { email: 'surveyor@maritime.example', role: 'Marine Surveyor', who: 'Inspections, certificates, compliance' },
  { email: 'finance@maritime.example', role: 'Finance Officer', who: 'Tariffs, invoicing, collections' },
  { email: 'agent@maritime.example', role: 'Shipping Agent', who: 'Announce calls, track invoices' },
];

const FACTS = [
  '12 operational modules over one shared dataset',
  'Deny-by-default RBAC · immutable audit on every write',
  "Digitally signed certificates with public verification",
  "Grounded AI assistance with per-answer citations",
];

export default function Login() {
  const dispatch = useDispatch();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busyAs, setBusyAs] = useState('');   // email being signed in

  const signIn = (mail, pass) => {
    setBusyAs(mail); setError('');
    api.post('/auth/login', { email: mail, password: pass })
      .then((r) => dispatch(setSession(r.data)))
      .catch((err) => { setError(err.message); setBusyAs(''); });
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.15fr 1fr' } }}>
      {/* left — port panorama */}
      <Box sx={{ position: 'relative', display: { xs: 'none', md: 'block' }, overflow: 'hidden', minHeight: '100vh' }}>
        <PortScene style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <Box sx={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,12,26,0.55) 0%, rgba(4,12,26,0.05) 34%, rgba(3,9,20,0.72) 100%)' }} />
        <Box sx={{ position: 'absolute', inset: 0, p: 5, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: '#EAF2FA' }}>
          <Box>
            <PlatformWordmark height={34} mono="#FFFFFF" style={{ filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.45))' }} />
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mt: 2.5 }}>
              <Box sx={{ width: 44, height: 44, borderRadius: '12px', background: BRAND_GRADIENT, display: 'grid', placeItems: 'center', boxShadow: '0 4px 18px rgba(0,0,0,0.4)' }}>
                <AnchorRoundedIcon sx={{ color: '#fff' }} />
              </Box>
              <Box>
                <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 19, color: '#fff', lineHeight: 1.1 }}>Maritime Operations</Typography>
                <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10, letterSpacing: '0.18em', color: 'rgba(234,242,250,0.75)' }}>
                  OPERATIONS PORTAL · REFERENCE DEPLOYMENT
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box>
            <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 44, lineHeight: 1.04, letterSpacing: '-0.02em', color: '#fff', maxWidth: 480, textShadow: '0 2px 24px rgba(0,0,0,0.45)' }}>
              One platform.<br />Every maritime service.<br />One operating picture.
            </Typography>
            <Stack spacing={0.9} sx={{ mt: 3 }}>
              {FACTS.map((f) => (
                <Stack key={f} direction="row" spacing={1.25} alignItems="center">
                  <Box sx={{ width: 22, height: 3.5, borderRadius: 2, background: BRAND_GRADIENT, flexShrink: 0 }} />
                  <Typography sx={{ fontSize: 14.5, color: 'rgba(234,242,250,0.95)', textShadow: '0 1px 10px rgba(0,0,0,0.5)' }}>{f}</Typography>
                </Stack>
              ))}
            </Stack>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10, color: 'rgba(234,242,250,0.55)', letterSpacing: '0.06em' }}>
              DEMONSTRATION SYSTEM · PORT FACTS RESEARCHED, TRANSACTIONS FICTIONAL
            </Typography>
            <MobiliseMark light />
          </Box>
        </Box>
      </Box>

      {/* right — sign in */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: 'background.default' }}>
        <Box sx={{ width: 440, maxWidth: '100%' }}>
          <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 1.25, alignItems: 'center', mb: 3 }}>
            <Box sx={{ width: 38, height: 38, borderRadius: '10px', background: BRAND_GRADIENT, display: 'grid', placeItems: 'center' }}>
              <AnchorRoundedIcon sx={{ color: '#fff', fontSize: 21 }} />
            </Box>
            <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 18 }}>Maritime Operations</Typography>
          </Box>

          <Box sx={{ display: { xs: 'none', md: 'block' }, mb: 2.5 }}>
            <PlatformWordmark height={26} />
          </Box>
          <Typography variant="h5">Welcome aboard</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>
            Pick a role to sign in — its permissions are applied automatically.
          </Typography>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Stack spacing={1}>
            {ROLES.map((r) => (
              <ButtonBase
                key={r.email} disabled={!!busyAs}
                onClick={() => signIn(r.email, 'Demo@2026')}
                sx={{
                  borderRadius: 2.5, textAlign: 'left', justifyContent: 'flex-start',
                  border: 1, borderColor: 'divider', bgcolor: 'background.paper',
                  p: 1.5, pl: 1.75, gap: 1.5, display: 'flex', alignItems: 'center', width: '100%',
                  transition: 'all .15s',
                  '&:hover': { borderColor: 'primary.main', transform: 'translateX(2px)' },
                }}
              >
                <Box sx={{ width: 38, height: 38, borderRadius: '10px', flexShrink: 0, background: BRAND_GRADIENT, display: 'grid', placeItems: 'center', color: '#fff', fontFamily: 'Archivo', fontWeight: 800, fontSize: 14 }}>
                  {r.role.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 14.5 }}>{r.role}</Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary' }}>{r.who}</Typography>
                </Box>
                {busyAs === r.email
                  ? <CircularProgress size={18} />
                  : <ArrowForwardRoundedIcon sx={{ color: 'text.secondary', fontSize: 19 }} />}
              </ButtonBase>
            ))}
          </Stack>

          <Divider sx={{ my: 2.5 }}>
            <Typography variant="caption" color="text.secondary">or sign in manually</Typography>
          </Divider>

          <Card sx={{ p: 2 }}>
            <form onSubmit={(e) => { e.preventDefault(); signIn(email, password); }}>
              <Stack spacing={1.5}>
                <TextField label="Email" size="small" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
                <TextField
                  label="Password" size="small" type={show ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)} fullWidth
                  InputProps={{ endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShow(!show)} edge="end" size="small">
                        {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ) }}
                />
                <Button type="submit" variant="contained" disabled={!!busyAs || !email || !password}>Sign in</Button>
              </Stack>
            </form>
          </Card>
          <Stack direction="row" spacing={1} sx={{ mt: 2 }} alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" variant="outlined" color="warning" label="DEMO" sx={{ fontSize: 10, fontWeight: 700 }} />
              <Typography variant="caption" color="text.secondary">Shared demo password: Demo@2026</Typography>
            </Stack>
            <Box sx={{ display: { xs: 'block', md: 'none' } }}><MobiliseMark /></Box>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
