import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Skeleton, Stack, Button, Table, TableHead, TableRow,
  TableCell, TableBody, TableContainer,
} from '@mui/material';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import PageHeader from '../../components/common/PageHeader';

/* Survey & audit dashboard — outcome mix, deficiency intensity and checklist
 * compliance across PSC/FSI/ISM/ISPS/MLC/HSE/terminal audits. */

const RESULT_COLORS = {
  light: { SATISFACTORY: '#0797A5', DEFICIENCIES: '#B98A2F', DETAINED: '#C14F33' },
  dark: { SATISFACTORY: '#2FA6AE', DEFICIENCIES: '#B8892B', DETAINED: '#D0644A' },
};

const Kpi = ({ label, value, sub, tone }) => (
  <Card sx={{ px: 2, py: 1.5, borderLeft: 3, borderLeftColor: tone ? `${tone}.main` : 'divider' }}>
    <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', mt: 0.25 }}>{label}</Typography>
    {sub && <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{sub}</Typography>}
  </Card>
);

export default function AuditDashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const mode = useSelector((s) => s.ui.mode);
  const RC = RESULT_COLORS[mode];
  const axis = mode === 'dark' ? '#89A5B0' : '#6B838E';
  const grid = mode === 'dark' ? '#152F3D' : '#E4EAE9';
  const paper = mode === 'dark' ? '#0C2330' : '#FFFFFF';
  const tooltipStyle = { backgroundColor: paper, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 };
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/inspections/dashboard').then((r) => setData(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, [dispatch]);

  if (!data) {
    return <Grid container spacing={2}>{Array.from({ length: 8 }).map((_, i) => <Grid item xs={6} md={3} key={i}><Skeleton variant="rounded" height={86} /></Grid>)}<Grid item xs={12}><Skeleton variant="rounded" height={300} /></Grid></Grid>;
  }
  const k = data.kpis;

  return (
    <>
      <PageHeader
        icon={FactCheckRoundedIcon} iconColor="#9C6412"
        title="Survey & audit dashboard" sub="Outcomes, deficiency intensity and checklist compliance across every survey type"
        actions={<Button variant="contained" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate('/inspections')}>Open register</Button>}
      />
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} md={3}><Kpi label="Open surveys" value={k.open} sub={`${k.closedYtd} closed YTD`} tone={k.open ? 'warning' : 'success'} /></Grid>
        <Grid item xs={6} md={3}><Kpi label="Satisfactory rate" value={`${k.satisfactionPct}%`} sub={`detention rate ${k.detentionRatePct}%`} tone={k.satisfactionPct >= 60 ? 'success' : 'warning'} /></Grid>
        <Grid item xs={6} md={3}><Kpi label="Avg findings / survey" value={k.avgFindings} sub={`${k.openFindings} findings still open`} tone={k.openFindings ? 'warning' : 'success'} /></Grid>
        <Grid item xs={6} md={3}><Kpi label="Checklist compliance" value={`${k.checklistCompliancePct}%`} sub="YES answers across closed surveys" tone="info" /></Grid>
      </Grid>
      <Grid container spacing={2}>
        <Grid item xs={12} lg={7.5}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" sx={{ fontSize: 15 }}>Closed surveys by month</Typography>
            <Typography variant="caption" color="text.secondary">Stacked by result — trailing 12 months</Typography>
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={data.byMonth} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: axis }} axisLine={{ stroke: grid }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, opacity: 0.35 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="SATISFACTORY" stackId="r" fill={RC.SATISFACTORY} name="Satisfactory" />
                <Bar dataKey="DEFICIENCIES" stackId="r" fill={RC.DEFICIENCIES} name="With deficiencies" />
                <Bar dataKey="DETAINED" stackId="r" fill={RC.DETAINED} name="Detained" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </Grid>
        <Grid item xs={12} lg={4.5}>
          <Card sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" sx={{ fontSize: 15 }}>By survey type</Typography>
            <Typography variant="caption" color="text.secondary">All time — total / closed / detained</Typography>
            <TableContainer sx={{ overflowX: 'auto', mt: 1 }}>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>Type</TableCell><TableCell align="right">Total</TableCell>
                  <TableCell align="right">Closed</TableCell><TableCell align="right">Detained</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {data.byType.map((t) => (
                    <TableRow key={t.type} hover>
                      <TableCell><b>{t.type}</b></TableCell>
                      <TableCell align="right">{t.total}</TableCell>
                      <TableCell align="right">{t.closed}</TableCell>
                      <TableCell align="right">{t.detained || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ mt: 1.5 }}>
              <Button size="small" onClick={() => navigate('/reports/view/deficiency-analysis')}>Deficiency analysis report</Button>
              <Button size="small" onClick={() => navigate('/reports/view/checklist-compliance')}>Compliance report</Button>
            </Box>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}
