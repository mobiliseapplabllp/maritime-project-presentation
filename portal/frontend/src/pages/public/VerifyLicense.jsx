import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Box, Card, Typography, Chip, Divider, CircularProgress } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CancelRoundedIcon from '@mui/icons-material/CancelRounded';
import HelpRoundedIcon from '@mui/icons-material/HelpRounded';
import AnchorRoundedIcon from '@mui/icons-material/AnchorRounded';
import api from '../../api/client';
import { BRAND_GRADIENT } from '../../theme';

/* Public, unauthenticated licence verification — the target of the QR code
 * printed on every licence certificate. No login required by design. */

export default function VerifyLicense() {
  const { licenseNo } = useParams();
  const [state, setState] = useState('loading'); // loading | found | notfound
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/public/verify/${encodeURIComponent(licenseNo)}`, { headers: { 'X-Quiet': '1' } })
      .then((r) => { setData(r.data); setState(r.data.found ? 'found' : 'notfound'); })
      .catch(() => setState('notfound'));
  }, [licenseNo]);

  const icon = data?.valid ? <CheckCircleRoundedIcon sx={{ fontSize: 56, color: '#2C6E52' }} />
    : state === 'found' ? <CancelRoundedIcon sx={{ fontSize: 56, color: '#B3452E' }} />
      : <HelpRoundedIcon sx={{ fontSize: 56, color: '#8A96A0' }} />;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0A2239', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
      <Card sx={{ maxWidth: 440, width: '100%', borderRadius: 3, overflow: 'hidden' }}>
        <Box sx={{ background: BRAND_GRADIENT, px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <AnchorRoundedIcon sx={{ color: '#fff' }} />
          <Typography sx={{ color: '#fff', fontWeight: 800, fontFamily: 'Archivo' }}>Maritime Operations — Licence Verification</Typography>
        </Box>
        <Box sx={{ p: 4, textAlign: 'center' }}>
          {state === 'loading' && <CircularProgress size={40} />}
          {state !== 'loading' && (
            <>
              {icon}
              <Typography sx={{ fontSize: 20, fontWeight: 800, mt: 1.5 }}>
                {state === 'notfound' ? 'Licence not found' : data.valid ? 'Licence is valid' : 'Licence is not valid'}
              </Typography>
              <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', color: 'text.secondary', mt: 0.5 }}>{licenseNo}</Typography>
              {state === 'found' && (
                <>
                  <Divider sx={{ my: 2.5 }} />
                  <Box sx={{ textAlign: 'left', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                    <Box><Typography variant="caption" color="text.secondary">Entity</Typography><Typography sx={{ fontSize: 14, fontWeight: 700 }}>{data.entityName}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Type</Typography><Typography sx={{ fontSize: 14, fontWeight: 700 }}>{String(data.entityType).replace(/_/g, ' ')}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Status</Typography><Box><Chip size="small" label={data.status} color={data.valid ? 'success' : 'default'} sx={{ height: 20 }} /></Box></Box>
                    <Box><Typography variant="caption" color="text.secondary">Valid till</Typography><Typography sx={{ fontSize: 14, fontWeight: 700 }}>{data.expiryDate ? new Date(data.expiryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</Typography></Box>
                  </Box>
                  <Divider sx={{ my: 2.5 }} />
                  <Typography variant="caption" color="text.secondary">{data.reason}</Typography>
                </>
              )}
              {state === 'notfound' && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>No licence with this number is on record.</Typography>
              )}
            </>
          )}
        </Box>
      </Card>
    </Box>
  );
}
