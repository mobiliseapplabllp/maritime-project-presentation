import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Box, Card, Grid, Typography, Chip, Skeleton, Stack } from '@mui/material';
import api from '../api/client';
import PageHeader from '../components/common/PageHeader';
import { fmtDT, fromNow } from '../utils/format';

export default function BerthBoard() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();
  const mode = useSelector((s) => s.ui.mode);

  useEffect(() => { api.get('/dashboard').then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return <Skeleton variant="rounded" height={420} />;

  const terminals = [...new Set(data.berthBoard.map((b) => b.terminal))];
  const occupied = data.berthBoard.filter((b) => b.occupiedBy).length;

  return (
    <>
      <PageHeader title="Berth board" sub={`${occupied} of ${data.berthBoard.length} berths occupied right now`} />
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Chip size="small" label="Occupied" sx={{ bgcolor: mode === 'dark' ? 'rgba(69,191,198,0.18)' : 'rgba(14,124,134,0.12)', fontWeight: 600 }} />
        <Chip size="small" label="Free" variant="outlined" />
        <Chip size="small" label="Maintenance" color="warning" variant="outlined" />
      </Stack>
      <Stack spacing={2.5}>
        {terminals.map((t) => (
          <Box key={t}>
            <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary', mb: 1 }}>{t}</Typography>
            <Grid container spacing={1.5}>
              {data.berthBoard.filter((b) => b.terminal === t).map((b) => (
                <Grid item xs={12} sm={6} md={3} key={b.code}>
                  <Card
                    onClick={b.occupiedBy ? () => navigate(`/port-calls/${b.occupiedBy.callId}`) : undefined}
                    sx={{
                      p: 1.75, height: '100%', cursor: b.occupiedBy ? 'pointer' : 'default',
                      borderColor: b.occupiedBy ? 'primary.main' : 'divider',
                      bgcolor: b.status === 'MAINTENANCE'
                        ? (mode === 'dark' ? 'rgba(224,166,78,0.10)' : 'rgba(156,100,18,0.06)')
                        : b.occupiedBy ? (mode === 'dark' ? 'rgba(69,191,198,0.08)' : 'rgba(14,124,134,0.05)') : 'background.paper',
                      '&:hover': b.occupiedBy ? { borderColor: 'primary.dark' } : undefined,
                    }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontWeight: 600, fontSize: 13 }}>{b.code}</Typography>
                      {b.status === 'MAINTENANCE'
                        ? <Chip size="small" color="warning" variant="outlined" label="Maint." sx={{ height: 20, fontSize: 10.5 }} />
                        : b.occupiedBy
                          ? <Chip size="small" color="primary" label="Occupied" sx={{ height: 20, fontSize: 10.5 }} />
                          : <Chip size="small" variant="outlined" label="Free" sx={{ height: 20, fontSize: 10.5 }} />}
                    </Box>
                    {b.occupiedBy ? (
                      <>
                        <Typography noWrap sx={{ fontWeight: 700, mt: 1 }}>{b.occupiedBy.vessel}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{b.occupiedBy.vcn}</Typography>
                        <Typography variant="caption" color="text.secondary">Berthed {fmtDT(b.occupiedBy.atb)}</Typography>
                        <Typography variant="caption" sx={{ display: 'block', color: 'primary.main', fontWeight: 600 }}>ETD {fromNow(b.occupiedBy.etd)}</Typography>
                      </>
                    ) : (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        {b.status === 'MAINTENANCE' ? b.name : `${b.name} — available`}
                      </Typography>
                    )}
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        ))}
      </Stack>
    </>
  );
}
