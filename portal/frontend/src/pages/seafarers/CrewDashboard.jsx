import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Skeleton, Stack, Button, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer, Chip, Divider,
} from '@mui/material';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { CHART_SERIES } from '../../theme';
import PageHeader from '../../components/common/PageHeader';
import EntityHover from '../../components/common/EntityHover';

/* Crew dashboard — the manning picture: roll strength, rank mix,
 * document expiry funnel and who needs attention first. */

const Kpi = ({ label, value, sub, tone }) => (
  <Card sx={{ px: 2, py: 1.5, borderLeft: 3, borderLeftColor: tone ? `${tone}.main` : 'divider' }}>
    <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', mt: 0.25 }}>{label}</Typography>
    {sub && <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{sub}</Typography>}
  </Card>
);

export default function CrewDashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const mode = useSelector((s) => s.ui.mode);
  const C = CHART_SERIES[mode];
  const axis = mode === 'dark' ? '#89A5B0' : '#6B838E';
  const grid = mode === 'dark' ? '#152F3D' : '#E4EAE9';
  const paper = mode === 'dark' ? '#0C2330' : '#FFFFFF';
  const tooltipStyle = { backgroundColor: paper, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 };
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/seafarers/dashboard').then((r) => setData(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, [dispatch]);

  if (!data) {
    return <Grid container spacing={2}>{Array.from({ length: 8 }).map((_, i) => <Grid item xs={6} md={3} key={i}><Skeleton variant="rounded" height={86} /></Grid>)}<Grid item xs={12}><Skeleton variant="rounded" height={300} /></Grid></Grid>;
  }
  const k = data.kpis;
  const funnelData = [
    { band: 'Expired', count: data.funnel.expired }, { band: '≤30 d', count: data.funnel.d30 },
    { band: '31–90 d', count: data.funnel.d90 }, { band: 'Valid >90 d', count: data.funnel.valid },
  ];

  return (
    <>
      <PageHeader
        icon={GroupsRoundedIcon} iconColor="#75479C"
        title="Crew dashboard" sub="Roll strength, rank mix and the document renewal pipeline — medicals, competency and STCW"
        actions={(
          <Stack direction="row" spacing={1}>
            <Button size="small" onClick={() => navigate('/reports/view/crew-medical')}>Medical register</Button>
            <Button size="small" onClick={() => navigate('/reports/view/crew-sea-service')}>Sea service</Button>
            <Button variant="contained" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/seafarers')}>Open register</Button>
          </Stack>
        )}
      />
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}><Kpi label="On the roll" value={k.roll} sub={`${k.onboard} on board · ${k.ashore} ashore`} /></Grid>
        <Grid item xs={6} md={3}><Kpi label="Medical issues" value={k.medicalIssues} sub={`window ${k.medicalWindow} days (module settings)`} tone={k.medicalIssues ? 'warning' : 'success'} /></Grid>
        <Grid item xs={6} md={3}><Kpi label="Documents expired" value={data.funnel.expired} sub={`${data.funnel.d30} more expire within 30 days`} tone={data.funnel.expired ? 'error' : 'success'} /></Grid>
        <Grid item xs={6} md={3}><Kpi label="Avg sea service" value={`${new Intl.NumberFormat('en-IN').format(k.avgSeaDays)} d`} sub="per seafarer, verified records" tone="info" /></Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid item xs={12} md={5}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" sx={{ fontSize: 15 }}>Rank distribution</Typography>
            <ResponsiveContainer width="100%" height={Math.max(220, data.byRank.length * 24)}>
              <BarChart data={data.byRank} layout="vertical" margin={{ top: 8, right: 24, left: 40, bottom: 0 }}>
                <CartesianGrid stroke={grid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="rank" width={130} tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, opacity: 0.35 }} />
                <Bar dataKey="count" fill={C.container} name="Seafarers" radius={[0, 3, 3, 0]} barSize={13} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Grid>
        <Grid item xs={12} md={3.5}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" sx={{ fontSize: 15 }}>Document expiry funnel</Typography>
            <Typography variant="caption" color="text.secondary">All crew documents by time to expiry</Typography>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={funnelData} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="band" tick={{ fontSize: 10.5, fill: axis }} axisLine={{ stroke: grid }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, opacity: 0.35 }} />
                <Bar dataKey="count" name="Documents" radius={[3, 3, 0, 0]} barSize={30}
                  fill={C.dryBulk} />
              </BarChart>
            </ResponsiveContainer>
            <Divider sx={{ my: 1 }} />
            <Button size="small" onClick={() => navigate('/reports/view/crew-cert-expiry')}>Full expiry report</Button>
          </Card>
        </Grid>
        <Grid item xs={12} md={3.5}>
          <Card sx={{ height: '100%' }}>
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="h6" sx={{ fontSize: 15 }}>Needs attention first</Typography>
              <Typography variant="caption" color="text.secondary">Most flagged documents per person</Typography>
            </Box>
            <Divider />
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableBody>
                  {data.alertList.map((s2) => (
                    <TableRow key={s2._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/seafarers/${s2._id}`)}>
                      <TableCell>
                        <EntityHover type="seafarer" id={s2._id}><b>{s2.name}</b></EntityHover>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{s2.rank} · {s2.vessel}</Typography>
                      </TableCell>
                      <TableCell align="right"><Chip size="small" color="warning" label={s2.alerts} sx={{ height: 20, fontWeight: 700 }} /></TableCell>
                    </TableRow>
                  ))}
                  {data.alertList.length === 0 && (
                    <TableRow><TableCell><Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Every document valid ✅</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}
