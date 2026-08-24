import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Divider, Chip,
} from '@mui/material';
import VerifiedUserRoundedIcon from '@mui/icons-material/VerifiedUserRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import { ADANI_GRADIENT } from '../../theme';
import { fmtD } from '../../utils/format';
import { licLabel } from './FacilitiesList';

/* Official-style licence certificate with a QR code that resolves to a
 * public, unauthenticated verification page — anyone with the printed
 * certificate can confirm the licence is genuinely current. */

export default function CertificateDialog({ license, open, onClose }) {
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (!open || !license) return;
    const url = `${window.location.origin}/verify/${encodeURIComponent(license.licenseNo)}`;
    QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: '#0A2239', light: '#FFFFFF' } })
      .then(setQr).catch(() => setQr(''));
  }, [open, license]);

  if (!license) return null;
  const valid = license.status === 'ISSUED';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <VerifiedUserRoundedIcon sx={{ color: '#2C6E52' }} /> Licence Certificate
      </DialogTitle>
      <DialogContent dividers>
        <Box id="cert-print-area" sx={{ border: '2px solid #0A2239', borderRadius: 2, overflow: 'hidden' }}>
          <Box sx={{ background: ADANI_GRADIENT, px: 3, py: 2.5, color: '#fff' }}>
            <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 13, letterSpacing: '0.08em' }}>MUNDRA PORT — OPERATIONS PORTAL</Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 800, mt: 0.5 }}>Certificate of Licence</Typography>
          </Box>
          <Box sx={{ p: 3, display: 'flex', gap: 3 }}>
            <Box sx={{ flex: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}>This certifies that</Typography>
              <Typography sx={{ fontSize: 21, fontWeight: 800, mt: 0.25 }}>{license.entityName}</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>holds a valid licence for</Typography>
              <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{licLabel(license.entityType)}</Typography>
              <Divider sx={{ my: 1.5 }} />
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
                <Box><Typography variant="caption" color="text.secondary">Licence no.</Typography><Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontWeight: 700, fontSize: 13 }}>{license.licenseNo}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">Status</Typography><Box><Chip size="small" label={license.status} color={valid ? 'success' : 'default'} sx={{ height: 20 }} /></Box></Box>
                <Box><Typography variant="caption" color="text.secondary">Issued</Typography><Typography sx={{ fontSize: 13, fontWeight: 600 }}>{fmtD(license.issueDate)}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">Valid till</Typography><Typography sx={{ fontSize: 13, fontWeight: 600 }}>{fmtD(license.expiryDate)}</Typography></Box>
              </Box>
            </Box>
            <Box sx={{ width: 150, textAlign: 'center', flexShrink: 0 }}>
              {qr && <Box component="img" src={qr} alt="Verification QR" sx={{ width: 120, height: 120, border: '1px solid #E4EAE9', borderRadius: 1 }} />}
              <Typography sx={{ fontSize: 9.5, color: 'text.secondary', mt: 0.75 }}>Scan to verify</Typography>
            </Box>
          </Box>
          <Divider />
          <Box sx={{ px: 3, py: 1.5, bgcolor: '#F4F7F7', display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary">Verify at {window.location.origin}/verify/{license.licenseNo}</Typography>
            <Typography variant="caption" color="text.secondary">Issued by Mundra Port Administration</Typography>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} color="inherit">Close</Button>
        <Button variant="contained" startIcon={<PrintRoundedIcon />} onClick={() => window.print()}>Print certificate</Button>
      </DialogActions>
    </Dialog>
  );
}
