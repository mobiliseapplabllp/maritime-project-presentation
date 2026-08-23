import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Card, Grid, Box, Typography, Skeleton, Stack, Chip, Rating, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, Divider, Button,
} from '@mui/material';
import CorporateFareRoundedIcon from '@mui/icons-material/CorporateFareRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import { fmtD } from '../../utils/format';

const LIC_META = {
  APPLIED: { label: 'Applied', color: 'default' }, UNDER_REVIEW: { label: 'Under review', color: 'info' },
  ISSUED: { label: 'Issued', color: 'success' }, REJECTED: { label: 'Rejected', color: 'error' },
  SUSPENDED: { label: 'Suspended', color: 'warning' }, REVOKED: { label: 'Revoked', color: 'error' },
};
const Item = ({ label, value }) => (
  <Box>
    <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>{label}</Typography>
    <Typography component="div" sx={{ fontSize: 13.5, fontWeight: 600, mt: 0.25 }}>{value ?? '—'}</Typography>
  </Box>
);

export default function CompanyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [c, setC] = useState(null);

  useEffect(() => {
    api.get(`/companies/${id}`).then((r) => setC(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, [id, dispatch]);

  if (!c) return <Skeleton variant="rounded" height={420} />;

  return (
    <>
      <PageHeader
        icon={CorporateFareRoundedIcon} iconColor="#2C6E52"
        crumbs={[{ label: 'Company directory', to: '/companies' }, { label: c.name }]}
        title={<Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
          <span>{c.name}</span>
          <Chip size="small" label={c.status} color={c.status === 'ACTIVE' ? 'success' : c.status === 'SUSPENDED' ? 'warning' : 'default'} sx={{ height: 20 }} />
          {c.real && <Chip size="small" variant="outlined" label="Documented operator" sx={{ height: 20 }} />}
        </Stack>}
        sub={`${c.code} · ${(c.types || []).map((t) => t.replace(/_/g, ' ').toLowerCase()).join(', ') || c.category.replace(/_/g, ' ').toLowerCase()}`}
      />
      <Card sx={{ p: 2.5, mb: 2 }}>
        <Grid container spacing={2.5}>
          <Grid item xs={6} md={3}><Item label="Contact person" value={c.contactPerson || '—'} /></Grid>
          <Grid item xs={6} md={3}><Item label="Phone / email" value={`${c.phone || '—'} · ${c.email || '—'}`} /></Grid>
          <Grid item xs={6} md={3}><Item label="GSTIN / PAN" value={`${c.gstin || '—'} · ${c.pan || '—'}`} /></Grid>
          <Grid item xs={6} md={3}><Item label="Onboarded" value={c.onboardedAt ? fmtD(c.onboardedAt) : '—'} /></Grid>
          <Grid item xs={12} md={6}><Item label="Address" value={`${c.address || '—'}, ${c.city}, ${c.state}`} /></Grid>
          <Grid item xs={6} md={3}><Item label="Performance" value={c.rating ? <Rating value={c.rating} precision={0.5} size="small" readOnly /> : 'Not rated'} /></Grid>
          <Grid item xs={6} md={3}><Item label="Active vessel calls" value={String(c.activeCalls ?? 0)} /></Grid>
          {c.remarks && <Grid item xs={12}><Item label="Remarks" value={c.remarks} /></Grid>}
        </Grid>
      </Card>
      <Card>
        <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontSize: 15 }}>Licences held ({(c.licences || []).length})</Typography>
          <Button size="small" onClick={() => navigate('/facilities')}>Open licence register</Button>
        </Box>
        <Divider />
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Licence no.</TableCell><TableCell>Type</TableCell><TableCell>Status</TableCell>
              <TableCell>Issued</TableCell><TableCell>Valid till</TableCell><TableCell align="right">Rating</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {(c.licences || []).map((l) => (
                <TableRow key={l._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/facilities/${l._id}`)}>
                  <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5 }}>{l.licenseNo}</TableCell>
                  <TableCell>{l.entityType.replace(/_/g, ' ')}</TableCell>
                  <TableCell><StatusChip value={l.status} map={LIC_META} /></TableCell>
                  <TableCell>{fmtD(l.issueDate)}</TableCell>
                  <TableCell>{fmtD(l.expiryDate)}</TableCell>
                  <TableCell align="right">{l.performanceRating || '—'}</TableCell>
                </TableRow>
              ))}
              {(c.licences || []).length === 0 && (
                <TableRow><TableCell colSpan={6}>
                  <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>No licences on record — apply through the licence register.</Typography>
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </>
  );
}
