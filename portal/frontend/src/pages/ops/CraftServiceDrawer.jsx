import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box, Typography, Stack, Chip, Divider, Skeleton, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, TablePagination, TextField, MenuItem, Card,
} from '@mui/material';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { CHART_SERIES } from '../../theme';
import FormDrawer from '../../components/common/FormDrawer';
import StatusChip from '../../components/common/StatusChip';
import { RESOURCE_STATUS_META } from '../../utils/status';
import { fmtD, fmtDT, fmtNum } from '../../utils/format';

/* One craft's service record — every tasking it has run, its out-of-service
 * windows and the utilisation those two produce. Jobs are paged server-side;
 * a tug carries several hundred. All figures are sample data. */

const Kpi = ({ label, value, sub }) => (
  <Card variant="outlined" sx={{ px: 1.5, py: 1.25, flex: 1, minWidth: 128 }}>
    <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 20, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'text.secondary', mt: 0.25 }}>{label}</Typography>
    {sub && <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>{sub}</Typography>}
  </Card>
);

const Heading = ({ children, sub }) => (
  <Box sx={{ mt: 2.5, mb: 1 }}>
    <Typography variant="h6" sx={{ fontSize: 14 }}>{children}</Typography>
    {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
  </Box>
);

export default function CraftServiceDrawer({ resource, onClose }) {
  const dispatch = useDispatch();
  const mode = useSelector((s) => s.ui.mode);
  const C = CHART_SERIES[mode];
  const axis = mode === 'dark' ? '#89A5B0' : '#6B838E';
  const grid = mode === 'dark' ? '#152F3D' : '#E4EAE9';
  const paper = mode === 'dark' ? '#0C2330' : '#FFFFFF';
  const tooltipStyle = { backgroundColor: paper, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 };

  const [data, setData] = useState(null);
  const [meta, setMeta] = useState({ total: 0, kinds: [] });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [kind, setKind] = useState('');

  useEffect(() => { setPage(1); setKind(''); setData(null); }, [resource?._id]);

  useEffect(() => {
    if (!resource) return;
    api.get(`/ops/resources/${resource._id}/history`, { params: { page, limit, kind: kind || undefined } })
      .then((r) => { setData(r.data); setMeta(r.meta || { total: 0, kinds: [] }); })
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, [resource, page, limit, kind, dispatch]);

  const s = data?.summary;
  return (
    <FormDrawer
      open={!!resource} width="72vw" onClose={onClose}
      title={resource ? `${resource.code} — ${resource.name}` : ''}
      subtitle={resource ? `${resource.spec || resource.type} · service record and utilisation (sample data)` : ''}
    >
      {!data ? <Skeleton variant="rounded" height={420} /> : (
        <>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5, flexWrap: 'wrap' }} useFlexGap>
            <StatusChip value={data.resource.status} map={RESOURCE_STATUS_META} />
            {data.resource.master && <Chip size="small" variant="outlined" label={`Master: ${data.resource.master}`} sx={{ height: 22, fontSize: 11 }} />}
            {data.resource.contact && <Chip size="small" variant="outlined" label={data.resource.contact} sx={{ height: 22, fontSize: 11 }} />}
            <Typography variant="caption" color="text.secondary">
              In service since {fmtD(s.lifetime.firstJobAt)} · last job {fmtD(s.lifetime.lastJobAt)}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }} useFlexGap>
            <Kpi label="Jobs · 12 months" value={fmtNum(s.jobs)} sub={`${s.avgJobsPerMonth}/month average`} />
            <Kpi label="Assist hours · 12 m" value={fmtNum(s.hours)} sub={`${s.avgHours} h per job`} />
            <Kpi label="Availability" value={`${s.availabilityPct}%`} sub={`${fmtNum(s.outageDays)} days out of service`} />
            <Kpi label="Jobs since 2023" value={fmtNum(s.lifetime.jobs)} sub={`${fmtNum(s.lifetime.hours)} hours logged`} />
            <Kpi label="Busiest month" value={s.busiestMonth ? s.busiestMonth.label : '—'} sub={s.busiestMonth ? `${fmtNum(s.busiestMonth.jobs)} jobs` : ''} />
          </Stack>

          <Heading sub="Jobs completed and hours run, last 12 months">Utilisation</Heading>
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={s.series} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: axis }} axisLine={{ stroke: grid }} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10.5, fill: axis }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10.5, fill: axis }} axisLine={false} tickLine={false} width={34} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: grid, opacity: 0.35 }} />
              <Bar yAxisId="l" dataKey="jobs" name="Jobs" fill={C.container} radius={[3, 3, 0, 0]} barSize={16} />
              <Line yAxisId="r" type="monotone" dataKey="hours" name="Hours" stroke={C.dryBulk} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>

          <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: 'wrap' }} useFlexGap>
            {s.byKind.map((k) => (
              <Chip key={k.kind} size="small" variant="outlined" sx={{ height: 22, fontSize: 11, fontWeight: 600 }}
                label={`${k.kind.replace(/_/g, ' ').toLowerCase()} · ${fmtNum(k.jobs)} jobs · ${fmtNum(k.hours)} h`} />
            ))}
          </Stack>

          <Heading sub={`${data.outages.length} window(s) since 2023 — ${fmtNum(s.lifetime.outageDays)} days total`}>Out of service</Heading>
          {data.outages.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No out-of-service window recorded for this unit.</Typography>
          ) : (
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell>From</TableCell><TableCell>To</TableCell>
                  <TableCell align="right">Days</TableCell><TableCell>Reason</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {data.outages.map((o) => (
                    <TableRow key={o._id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtD(o.from)}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtD(o.to)}</TableCell>
                      <TableCell align="right" sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5 }}>{o.days}</TableCell>
                      <TableCell>{o.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Heading sub="Newest first — paged from the server">Jobs done</Heading>
          <TextField
            select size="small" label="Job type" value={kind} sx={{ minWidth: 190, mb: 1 }}
            onChange={(e) => { setKind(e.target.value); setPage(1); }}
          >
            <MenuItem value="">All types</MenuItem>
            {(meta.kinds || []).map((k) => <MenuItem key={k} value={k}>{k.replace(/_/g, ' ')}</MenuItem>)}
          </TextField>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>When</TableCell><TableCell>VCN</TableCell><TableCell>Vessel</TableCell>
                <TableCell>Berth</TableCell><TableCell>Type</TableCell>
                <TableCell align="right">Hours</TableCell><TableCell>Remarks</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {data.jobs.map((j) => (
                  <TableRow key={j._id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtDT(j.at)}</TableCell>
                    <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5 }}>{j.vcn || '—'}</TableCell>
                    <TableCell>{j.vesselName || '—'}</TableCell>
                    <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5 }}>{j.berth || '—'}</TableCell>
                    <TableCell><Chip size="small" label={String(j.kind || '').replace(/_/g, ' ')} sx={{ height: 20, fontSize: 10.5 }} /></TableCell>
                    <TableCell align="right" sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5 }}>{j.hours}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{j.remarks || '—'}</TableCell>
                  </TableRow>
                ))}
                {data.jobs.length === 0 && (
                  <TableRow><TableCell colSpan={7}>
                    <Typography sx={{ py: 3, textAlign: 'center' }} color="text.secondary">No jobs recorded for this unit.</Typography>
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div" count={meta.total || 0} page={page - 1} rowsPerPage={limit}
            onPageChange={(_, p) => setPage(p + 1)}
            onRowsPerPageChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            rowsPerPageOptions={[10, 25, 50]}
          />
          <Divider sx={{ mt: 1 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Fictional demo data — taskings are generated against the sample port-call history.
          </Typography>
        </>
      )}
    </FormDrawer>
  );
}
