import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Skeleton, Chip, Stack, Button, Table, TableHead,
  TableRow, TableCell, TableBody, Divider, TableContainer,
} from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import { INCIDENT_STATUS_META, SEVERITY_META } from '../../utils/status';
import { fromNow } from '../../utils/format';

const SEV_COLORS = {
  light: { LOW: '#0797A5', MEDIUM: '#B98A2F', HIGH: '#C14F33', CRITICAL: '#7E2213' },
  dark: { LOW: '#2FA6AE', MEDIUM: '#B8892B', HIGH: '#D0644A', CRITICAL: '#F0937A' },
};
const SEV_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const Kpi = ({ label, value, sub, tone }) => (
  <Card sx={{ px: 2, py: 1.5, borderLeft: 3, borderLeftColor: tone ? `${tone}.main` : 'divider' }}>
    <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', mt: 0.25 }}>{label}</Typography>
    {sub && <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{sub}</Typography>}
  </Card>
);

const Section = ({ title, sub, children }) => (
  <Card sx={{ p: 2, height: '100%' }}>
    <Typography variant="h6" sx={{ fontSize: 15 }}>{title}</Typography>
    {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
    <Box sx={{ mt: 1.5 }}>{children}</Box>
  </Card>
);

export default function IncidentDashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const mode = useSelector((s) => s.ui.mode);
  const SEV = SEV_COLORS[mode];
  const axis = mode === 'dark' ? '#89A5B0' : '#6B838E';
  const grid = mode === 'dark' ? '#152F3D' : '#E4EAE9';
  const paper = mode === 'dark' ? '#0C2330' : '#FFFFFF';
  const tooltipStyle = { backgroundColor: paper, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 };
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/incidents/dashboard').then((r) => setData(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, [dispatch]);

  if (!data) {
    return (
      <Grid container spacing={2}>
        {Array.from({ length: 8 }).map((_, i) => <Grid item xs={6} md={3} key={i}><Skeleton variant="rounded" height={86} /></Grid>)}
        <Grid item xs={12}><Skeleton variant="rounded" height={320} /></Grid>
      </Grid>
    );
  }
  const k = data.kpis;

  return (
    <>
      <PageHeader
        icon={MonitorHeartRoundedIcon} iconColor="#B3452E" title="Incident dashboard"
        sub="Response posture across HSE, marine, security, cargo and equipment cases — trailing 12 months"
        actions={<Button variant="contained" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/incidents')}>Open register</Button>}
      />
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}><Kpi label="Open cases" value={k.open} sub={`${k.highOpen} high / critical`} tone={k.highOpen ? 'error' : 'success'} /></Grid>
        <Grid item xs={6} md={3}><Kpi label="Logged YTD" value={k.loggedYtd} sub={`${k.closedYtd} closed YTD`} /></Grid>
        <Grid item xs={6} md={3}><Kpi label="Mean time to resolve" value={`${k.mttrHrs} h`} sub={`acknowledge in ~${k.mttaMin} min`} tone="info" /></Grid>
        <Grid item xs={6} md={3}><Kpi label="Injuries YTD" value={k.injuriesYtd} sub="recordable — personnel category" tone={k.injuriesYtd ? 'warning' : 'success'} /></Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={7.5}>
          <Section title="Incidents by month" sub="Stacked by severity — trailing 12 months">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.byMonth} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: axis }} axisLine={{ stroke: grid }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, opacity: 0.35 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {SEV_ORDER.map((s) => (
                  <Bar key={s} dataKey={s} stackId="sev" fill={SEV[s]} name={SEVERITY_META[s].label} radius={s === 'CRITICAL' ? [3, 3, 0, 0] : 0} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Section>
        </Grid>
        <Grid item xs={12} lg={4.5}>
          <Section title="Open-case ageing" sub="Everything not yet resolved, by age bucket">
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={data.aging} layout="vertical" margin={{ top: 0, right: 18, left: 4, bottom: 0 }}>
                <CartesianGrid stroke={grid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="bucket" width={52} tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, opacity: 0.35 }} />
                <Bar dataKey="count" fill={SEV.HIGH} name="Open cases" radius={[0, 3, 3, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
            <Divider sx={{ my: 1.5 }} />
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {data.byStatus.map((s) => (
                <Chip key={s.status} size="small" variant="outlined"
                  label={`${INCIDENT_STATUS_META[s.status]?.label || s.status} · ${s.count}`}
                  color={INCIDENT_STATUS_META[s.status]?.color || 'default'} sx={{ fontWeight: 600 }} />
              ))}
            </Stack>
          </Section>
        </Grid>
        <Grid item xs={12} md={7}>
          <Section title="By incident type" sub="Trailing 12 months">
            <ResponsiveContainer width="100%" height={Math.max(200, data.byType.length * 26)}>
              <BarChart data={data.byType} layout="vertical" margin={{ top: 0, right: 24, left: 24, bottom: 0 }}>
                <CartesianGrid stroke={grid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="type" width={140} tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => v.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, opacity: 0.35 }} />
                <Bar dataKey="count" fill={SEV.LOW} name="Cases" radius={[0, 3, 3, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </Section>
        </Grid>
        <Grid item xs={12} md={5}>
          <Section title="Live open cases" sub="Oldest first — click to open the case file">
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>Case</TableCell><TableCell>Severity</TableCell><TableCell>Status</TableCell><TableCell>Age</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {data.openList.map((i) => (
                    <TableRow key={i._id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/incidents/${i._id}`)}>
                      <TableCell>
                        <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12 }}>{i.number}</Typography>
                        <Typography noWrap sx={{ fontSize: 12, color: 'text.secondary', maxWidth: 220 }}>{i.title}</Typography>
                      </TableCell>
                      <TableCell><StatusChip value={i.severity} map={SEVERITY_META} /></TableCell>
                      <TableCell><StatusChip value={i.status} map={INCIDENT_STATUS_META} /></TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fromNow(i.reportedAt)}</TableCell>
                    </TableRow>
                  ))}
                  {data.openList.length === 0 && (
                    <TableRow><TableCell colSpan={4}>
                      <Typography sx={{ py: 3, textAlign: 'center' }} color="text.secondary">No open cases — all clear ✅</Typography>
                    </TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Section>
        </Grid>
        <Grid item xs={12}>
          <Section title="By category" sub="Where the cases come from">
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              {data.byCategory.map((c) => (
                <Chip key={c.category} label={`${c.category.charAt(0) + c.category.slice(1).toLowerCase()} · ${c.count}`}
                  variant="outlined" sx={{ fontWeight: 600 }} />
              ))}
            </Stack>
          </Section>
        </Grid>
      </Grid>
    </>
  );
}
