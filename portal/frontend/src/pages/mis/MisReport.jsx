import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Skeleton, Chip, Stack, Button, Tabs, Tab, Table, TableHead,
  TableRow, TableCell, TableBody, TextField, Divider, TableContainer,
} from '@mui/material';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line, LabelList,
} from 'recharts';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { CHART_SERIES, SERIES_ORDER, SERIES_LABELS } from '../../theme';
import PageHeader from '../../components/common/PageHeader';
import { fmtMT, fmtNum, fmtINRShort, fmtINR } from '../../utils/format';

const CARGO_LABELS = { CONTAINERS: 'Containers', COAL: 'Coal', CRUDE: 'Crude oil', POL: 'POL', FERT: 'Fertilizer', GRAIN: 'Grain', STEEL: 'Steel', EDIBLE: 'Edible oil', AUTO: 'Automobiles', PROJ: 'Project' };
const PRESETS = [
  { label: '3 months', months: 3 }, { label: '6 months', months: 6 }, { label: '12 months', months: 12 },
];
const iso = (d) => d.toISOString().slice(0, 10);

function toCsv(rows, columns) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [columns.map((c) => esc(c.label)).join(','), ...rows.map((r) => columns.map((c) => esc(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','))].join('\n');
}
async function downloadCsv(name, rows, columns) {
  const csv = toCsv(rows, columns);
  // Inside the published artifact viewer plain downloads are sandboxed away;
  // the runtime's downloads capability is the only save path there.
  if (typeof window.claude?.use === 'function') {
    try {
      const downloads = await window.claude.use('downloads');
      if (downloads) {
        try {
          await downloads.save({ filename: name, data: csv });
        } catch (e) {
          if (e?.code === 'extension_not_enabled') await downloads.save({ filename: name.replace(/\.csv$/, '.txt'), data: csv });
        }
        return;
      }
    } catch { /* fall through to the browser download */ }
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const Kpi = ({ label, value, sub }) => (
  <Card sx={{ px: 2, py: 1.5 }}>
    <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 22, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary', mt: 0.25 }}>{label}</Typography>
    {sub && <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{sub}</Typography>}
  </Card>
);

function Section({ title, sub, onCsv, children }) {
  return (
    <Card sx={{ p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box>
          <Typography variant="h6" sx={{ fontSize: 15 }}>{title}</Typography>
          {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
        </Box>
        {onCsv && <Button size="small" startIcon={<DownloadRoundedIcon sx={{ fontSize: 16 }} />} onClick={onCsv} sx={{ displayPrint: 'none' }}>CSV</Button>}
      </Box>
      {children}
    </Card>
  );
}

export default function MisReport() {
  const dispatch = useDispatch();
  const mode = useSelector((s) => s.ui.mode);
  const C = CHART_SERIES[mode];
  const axis = mode === 'dark' ? '#89A5B0' : '#6B838E';
  const grid = mode === 'dark' ? '#152F3D' : '#E4EAE9';
  const paper = mode === 'dark' ? '#0C2330' : '#FFFFFF';
  const tooltipStyle = { backgroundColor: paper, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 };

  const now = new Date();
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 11, 1)));
  const [to, setTo] = useState(iso(now));
  const [tab, setTab] = useState(0);
  const [data, setData] = useState(null);

  const load = (f = from, t = to) => {
    setData(null);
    api.get('/reports/mis', { params: { from: f, to: t } }).then((r) => setData(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  };
  useEffect(() => { load(); }, []); // eslint-disable-line

  const preset = (months) => {
    const f = iso(new Date(now.getFullYear(), now.getMonth() - months + 1, 1));
    const t = iso(now);
    setFrom(f); setTo(t); load(f, t);
  };

  return (
    <>
      <PageHeader
        icon={AssessmentRoundedIcon} iconColor="#0B5D8A" title="MIS report" sub="Management aggregates across cargo, traffic, revenue, compliance and licensing"
        actions={<Button variant="outlined" startIcon={<PrintRoundedIcon />} onClick={() => window.print()}>Print / PDF</Button>}
      />
      <Card sx={{ p: 1.5, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', displayPrint: 'none' }}>
        {PRESETS.map((p) => (
          <Chip key={p.label} label={p.label} variant="outlined" onClick={() => preset(p.months)} sx={{ fontWeight: 600 }} />
        ))}
        <Divider orientation="vertical" flexItem />
        <TextField size="small" type="date" label="From" value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="To" value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
        <Button variant="contained" onClick={() => load()}>Run report</Button>
        {data && <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>Period {data.range.from} → {data.range.to}</Typography>}
      </Card>

      {!data ? (
        <Grid container spacing={2}>{Array.from({ length: 8 }).map((_, i) => <Grid item xs={6} md={3} key={i}><Skeleton variant="rounded" height={86} /></Grid>)}</Grid>
      ) : (
        <>
          <Grid container spacing={1.5} sx={{ mb: 2 }}>
            <Grid item xs={6} md={3}><Kpi label="Cargo handled" value={fmtMT(data.cargo.totalMT)} sub={`${fmtNum(data.cargo.totalTEU)} TEU`} /></Grid>
            <Grid item xs={6} md={3}><Kpi label="Vessel calls" value={fmtNum(data.cargo.calls)} sub={`avg turnaround ${data.cargo.avgTurnaroundHrs} h`} /></Grid>
            <Grid item xs={6} md={3}><Kpi label="Revenue billed" value={fmtINRShort(data.revenue.billed)} sub={`collected ${fmtINRShort(data.revenue.collected)}`} /></Grid>
            <Grid item xs={6} md={3}><Kpi label="Inspections closed" value={data.compliance.inspections} sub={`${data.compliance.detentions} detention(s)`} /></Grid>
          </Grid>

          <Tabs value={tab} onChange={(_, t) => setTab(t)} sx={{ mb: 2, displayPrint: 'none' }}>
            <Tab label="Cargo & traffic" /><Tab label="Revenue" /><Tab label="Compliance & licensing" />
          </Tabs>

          {tab === 0 && (
            <Grid container spacing={2}>
              <Grid item xs={12} lg={8}>
                <Section title="Cargo throughput by month" sub="metric tonnes by cargo group"
                  onCsv={() => downloadCsv('mis-cargo-by-month.csv', data.cargo.byMonth, [
                    { label: 'Month', value: 'month' }, { label: 'Container MT', value: 'container' },
                    { label: 'Dry bulk MT', value: 'dryBulk' }, { label: 'Liquid MT', value: 'liquid' },
                    { label: 'Other MT', value: 'other' }, { label: 'Total MT', value: 'total' },
                    { label: 'TEU', value: 'teu' }, { label: 'Calls', value: 'calls' }])}>
                  <Box sx={{ height: 300 }}>
                    <ResponsiveContainer>
                      <BarChart data={data.cargo.byMonth} barCategoryGap="28%">
                        <CartesianGrid stroke={grid} vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: axis, fontSize: 11 }} axisLine={{ stroke: grid }} tickLine={false} />
                        <YAxis tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [fmtMT(v), SERIES_LABELS[name] || name]} cursor={{ fill: mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(11,31,42,0.04)' }} />
                        <Legend formatter={(v) => <span style={{ color: axis, fontSize: 12 }}>{SERIES_LABELS[v] || v}</span>} iconSize={10} />
                        {SERIES_ORDER.map((key) => (
                          <Bar key={key} dataKey={key} stackId="mt" fill={C[key]} stroke={paper} strokeWidth={2} radius={key === 'other' ? [4, 4, 0, 0] : 0} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Section>
              </Grid>
              <Grid item xs={12} lg={4}>
                <Section title="Commodity mix" sub="share of tonnage in period"
                  onCsv={() => downloadCsv('mis-commodity.csv', data.cargo.byCommodity, [{ label: 'Commodity', value: (r) => CARGO_LABELS[r.name] || r.name }, { label: 'MT', value: 'mt' }])}>
                  <Box sx={{ height: 300 }}>
                    <ResponsiveContainer>
                      <BarChart data={data.cargo.byCommodity.slice(0, 8).map((x) => ({ ...x, label: CARGO_LABELS[x.name] || x.name, pct: Math.round((x.mt / Math.max(1, data.cargo.totalMT)) * 100) }))} layout="vertical" margin={{ left: 8, right: 42, top: 4 }} barCategoryGap="26%">
                        <CartesianGrid stroke={grid} horizontal={false} />
                        <XAxis type="number" hide /><YAxis type="category" dataKey="label" width={86} tick={{ fill: axis, fontSize: 11.5 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [fmtMT(v), 'Handled']} />
                        <Bar dataKey="mt" fill={C.container} radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="pct" position="right" formatter={(v) => `${v}%`} style={{ fill: axis, fontSize: 11 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Section>
              </Grid>
              <Grid item xs={12} lg={7}>
                <Section title="Terminal performance" sub="calls and tonnage by terminal"
                  onCsv={() => downloadCsv('mis-terminals.csv', data.traffic.byTerminal, [{ label: 'Terminal', value: 'terminal' }, { label: 'Calls', value: 'calls' }, { label: 'MT', value: 'mt' }])}>
                  <TableContainer sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead><TableRow><TableCell>Terminal</TableCell><TableCell align="right">Calls</TableCell><TableCell align="right">Cargo (MT)</TableCell><TableCell align="right">Share</TableCell></TableRow></TableHead>
                      <TableBody>
                        {data.traffic.byTerminal.map((t) => (
                          <TableRow key={t.terminal} hover>
                            <TableCell><b>{t.terminal}</b></TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(t.calls)}</TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(t.mt)}</TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round((t.mt / Math.max(1, data.cargo.totalMT)) * 100)}%</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Section>
              </Grid>
              <Grid item xs={12} lg={5}>
                <Section title="Calls by vessel type" sub={`waiting avg ${data.cargo.avgWaitingHrs} h before berthing`}>
                  <Box sx={{ height: 250 }}>
                    <ResponsiveContainer>
                      <BarChart data={data.traffic.byVesselType} margin={{ top: 18 }} barCategoryGap="30%">
                        <CartesianGrid stroke={grid} vertical={false} />
                        <XAxis dataKey="type" tick={{ fill: axis, fontSize: 11 }} axisLine={{ stroke: grid }} tickLine={false} />
                        <YAxis tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, 'Calls']} />
                        <Bar dataKey="calls" fill={C.liquid} radius={[4, 4, 0, 0]}>
                          <LabelList dataKey="calls" position="top" style={{ fill: axis, fontSize: 11 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Section>
              </Grid>
            </Grid>
          )}

          {tab === 1 && (
            <Grid container spacing={2}>
              <Grid item xs={12} lg={8}>
                <Section title="Billed vs collected by month" sub="₹, issued invoices vs payments received"
                  onCsv={() => downloadCsv('mis-revenue-by-month.csv', data.revenue.byMonth, [{ label: 'Month', value: 'month' }, { label: 'Billed', value: 'billed' }, { label: 'Collected', value: 'collected' }])}>
                  <Box sx={{ height: 300 }}>
                    <ResponsiveContainer>
                      <LineChart data={data.revenue.byMonth}>
                        <CartesianGrid stroke={grid} vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: axis, fontSize: 11 }} axisLine={{ stroke: grid }} tickLine={false} />
                        <YAxis tickFormatter={(v) => `${(v / 1e7).toFixed(1)}Cr`} tick={{ fill: axis, fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmtINRShort(v), n === 'billed' ? 'Billed' : 'Collected']} />
                        <Legend formatter={(v) => <span style={{ color: axis, fontSize: 12 }}>{v === 'billed' ? 'Billed' : 'Collected'}</span>} iconSize={10} />
                        <Line type="monotone" dataKey="billed" stroke={C.liquid} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                        <Line type="monotone" dataKey="collected" stroke={C.container} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </Box>
                </Section>
              </Grid>
              <Grid item xs={12} lg={4}>
                <Section title="Revenue by tariff head" sub="billed amounts in period"
                  onCsv={() => downloadCsv('mis-revenue-heads.csv', data.revenue.byHead, [{ label: 'Code', value: 'code' }, { label: 'Head', value: 'name' }, { label: 'Amount', value: 'amount' }])}>
                  <TableContainer sx={{ maxHeight: 300, overflowY: 'auto' }}>
                    <Table size="small" stickyHeader>
                      <TableHead><TableRow><TableCell>Head</TableCell><TableCell align="right">Billed</TableCell></TableRow></TableHead>
                      <TableBody>
                        {data.revenue.byHead.map((h) => (
                          <TableRow key={h.code} hover>
                            <TableCell><Chip size="small" label={h.code} sx={{ height: 19, fontSize: 10, fontFamily: '"IBM Plex Mono",monospace', mr: 0.75 }} />{h.name}</TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtINR(h.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Divider sx={{ my: 1 }} />
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Outstanding (all time)</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{fmtINRShort(data.revenue.outstanding)}</Typography>
                  </Stack>
                </Section>
              </Grid>
            </Grid>
          )}

          {tab === 2 && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Section title="Inspections" sub={`${data.compliance.inspections} closed in period`}>
                  <Stack spacing={1}>
                    {data.compliance.byType.map((t) => (
                      <Stack key={t.type} direction="row" justifyContent="space-between"><Typography variant="body2">{t.type}</Typography><Typography variant="body2" sx={{ fontWeight: 700 }}>{t.count}</Typography></Stack>
                    ))}
                    <Divider />
                    {data.compliance.byResult.map((t) => (
                      <Stack key={t.result} direction="row" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">{t.result.replace(/_/g, ' ')}</Typography>
                        <Typography variant="body2">{t.count}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Section>
              </Grid>
              <Grid item xs={12} md={8}>
                <Section title="Most frequent deficiencies" sub="findings recorded in period"
                  onCsv={() => downloadCsv('mis-deficiencies.csv', data.compliance.topDeficiencies, [{ label: 'Code', value: 'code' }, { label: 'Deficiency', value: 'label' }, { label: 'Count', value: 'count' }])}>
                  <Box sx={{ height: 260 }}>
                    <ResponsiveContainer>
                      <BarChart data={data.compliance.topDeficiencies.map((d) => ({ ...d, short: d.code }))} layout="vertical" margin={{ left: 8, right: 34 }} barCategoryGap="26%">
                        <CartesianGrid stroke={grid} horizontal={false} />
                        <XAxis type="number" hide allowDecimals={false} />
                        <YAxis type="category" dataKey="short" width={56} tick={{ fill: axis, fontSize: 11, fontFamily: 'IBM Plex Mono' }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v, _n, p) => [v, p.payload.label]} />
                        <Bar dataKey="count" fill={C.dryBulk} radius={[0, 4, 4, 0]}>
                          <LabelList dataKey="count" position="right" style={{ fill: axis, fontSize: 11 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Section>
              </Grid>
              <Grid item xs={12} md={6}>
                <Section title="Certificate compliance (now)" sub="fleet and crew statutory certificates">
                  <Table size="small">
                    <TableHead><TableRow><TableCell /><TableCell align="right">Expiring ≤30 d</TableCell><TableCell align="right">Expired</TableCell></TableRow></TableHead>
                    <TableBody>
                      <TableRow><TableCell><b>Vessel certificates</b></TableCell><TableCell align="right">{data.compliance.vesselCerts.expiring}</TableCell><TableCell align="right">{data.compliance.vesselCerts.expired}</TableCell></TableRow>
                      <TableRow><TableCell><b>Seafarer certificates</b></TableCell><TableCell align="right">{data.compliance.seafarerCerts.expiring}</TableCell><TableCell align="right">{data.compliance.seafarerCerts.expired}</TableCell></TableRow>
                    </TableBody>
                  </Table>
                </Section>
              </Grid>
              <Grid item xs={12} md={6}>
                <Section title="Licensing (now)" sub={`${data.licensing.expiring90} licence(s) expiring within 90 days`}>
                  <Stack spacing={1}>
                    {data.licensing.byStatus.map((x) => (
                      <Stack key={x.status} direction="row" justifyContent="space-between">
                        <Typography variant="body2">{x.status.replace(/_/g, ' ')}</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{x.count}</Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Section>
              </Grid>
            </Grid>
          )}
        </>
      )}
    </>
  );
}
