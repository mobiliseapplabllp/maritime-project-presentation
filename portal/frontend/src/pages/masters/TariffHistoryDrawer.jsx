import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box, Typography, Stack, Chip, Card, Skeleton, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, TextField, Divider,
} from '@mui/material';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { CHART_SERIES } from '../../theme';
import FormDrawer from '../../components/common/FormDrawer';
import { fmtD, fmtINR, toInputD } from '../../utils/format';

/* Published rate history for one tariff head — the trend, the revision trail
 * and what the rate read on any given date. Sample tariff schedule. */

const Kpi = ({ label, value, sub, tone }) => (
  <Card variant="outlined" sx={{ px: 1.5, py: 1.25, flex: 1, minWidth: 132 }}>
    <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 19, fontVariantNumeric: 'tabular-nums', color: tone }}>{value}</Typography>
    <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'text.secondary', mt: 0.25 }}>{label}</Typography>
    {sub && <Typography sx={{ fontSize: 10.5, color: 'text.secondary' }}>{sub}</Typography>}
  </Card>
);

// The rate a revision trail read on a given date: the latest revision in force,
// or the base rate if the date sits before the first published revision.
export function rateAsAt(revisions, baseRate, when) {
  const t = new Date(when).getTime();
  let rate = baseRate; let rev = null;
  for (const r of revisions) {
    if (new Date(r.effectiveFrom).getTime() <= t) { rate = r.rate; rev = r; }
  }
  return { rate, revision: rev };
}

export default function TariffHistoryDrawer({ item, onClose }) {
  const dispatch = useDispatch();
  const mode = useSelector((s) => s.ui.mode);
  const C = CHART_SERIES[mode];
  const axis = mode === 'dark' ? '#89A5B0' : '#6B838E';
  const grid = mode === 'dark' ? '#152F3D' : '#E4EAE9';
  const paper = mode === 'dark' ? '#0C2330' : '#FFFFFF';
  const tooltipStyle = { backgroundColor: paper, border: `1px solid ${grid}`, borderRadius: 8, fontSize: 12 };

  const [data, setData] = useState(null);
  const [asAt, setAsAt] = useState(toInputD(new Date()));

  useEffect(() => { setData(null); setAsAt(toInputD(new Date())); }, [item?._id]);
  useEffect(() => {
    if (!item) return;
    api.get(`/tariffs/${item._id}/history`)
      .then((r) => setData(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, [item, dispatch]);

  const reading = useMemo(
    () => (data ? rateAsAt(data.revisions, data.summary.baseRate, asAt || new Date()) : null),
    [data, asAt],
  );

  const s = data?.summary;
  const up = s ? s.totalChangePct >= 0 : true;
  return (
    <FormDrawer
      open={!!item} width="62vw" onClose={onClose}
      title={item ? `${item.code} — ${item.name}` : ''}
      subtitle={item ? `Published rate history · ${item.unit} · sample tariff schedule` : ''}
    >
      {!data ? <Skeleton variant="rounded" height={380} /> : (
        <>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mb: 2 }} useFlexGap>
            <Kpi label="Current rate" value={fmtINR(data.item.rate)} sub={data.item.unit} />
            <Kpi
              label="Since base rate" tone={up ? 'success.main' : 'error.main'}
              value={`${up ? '+' : ''}${s.totalChangePct}%`} sub={`from ${fmtINR(s.baseRate)}`}
            />
            <Kpi label="Last revision" value={s.lastChangePct !== null ? `+${s.lastChangePct}%` : '—'} sub={s.lastEffectiveFrom ? fmtD(s.lastEffectiveFrom) : 'no revision on record'} />
            <Kpi label="Compound annual" value={`${s.cagrPct}%`} sub={`${s.revisions} revisions on record`} />
          </Stack>

          <Typography variant="h6" sx={{ fontSize: 14 }}>Rate trend</Typography>
          <Typography variant="caption" color="text.secondary">Each step is a published circular taking effect on 1 April</Typography>
          <Box sx={{ mt: 1.5 }}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={data.series} margin={{ top: 6, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid stroke={grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: axis }} axisLine={{ stroke: grid }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: axis }} axisLine={false} tickLine={false} width={72}
                  domain={['auto', 'auto']} tickFormatter={(v) => new Intl.NumberFormat('en-IN').format(v)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmtINR(v)} cursor={{ stroke: grid }} />
                <Line type="stepAfter" dataKey="rate" name={`Rate (${data.item.unit})`} stroke={C.container} strokeWidth={2.5}
                  dot={{ r: 3, fill: C.container }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </Box>

          <Card variant="outlined" sx={{ p: 1.75, mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField
              size="small" type="date" label="Rate as at" value={asAt} sx={{ width: 190 }}
              onChange={(e) => setAsAt(e.target.value)} InputLabelProps={{ shrink: true }}
            />
            <Box>
              <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 20 }}>{fmtINR(reading.rate)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {reading.revision
                  ? `in force from ${fmtD(reading.revision.effectiveFrom)} · ${reading.revision.circular}`
                  : 'base rate — before the first revision on record'}
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }} />
            <Chip
              size="small" variant="outlined"
              icon={up ? <TrendingUpRoundedIcon /> : <TrendingDownRoundedIcon />}
              label={`${s.avgChangePct}% average revision`} sx={{ height: 24, fontSize: 11 }}
            />
          </Card>

          <Typography variant="h6" sx={{ fontSize: 14, mt: 2.5, mb: 1 }}>Revisions</Typography>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Effective from</TableCell>
                <TableCell align="right">Previous</TableCell>
                <TableCell align="right">Revised to</TableCell>
                <TableCell align="right">Change</TableCell>
                <TableCell>Circular</TableCell>
                <TableCell>Note</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {data.revisions.slice().reverse().map((r) => (
                  <TableRow key={r._id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fmtD(r.effectiveFrom)}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5, color: 'text.secondary' }}>{fmtINR(r.previousRate)}</TableCell>
                    <TableCell align="right" sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5, fontWeight: 700 }}>{fmtINR(r.rate)}</TableCell>
                    <TableCell align="right">
                      <Chip size="small" color={r.changePct >= 0 ? 'warning' : 'success'} variant="outlined"
                        label={`${r.changePct >= 0 ? '+' : ''}${r.changePct}%`} sx={{ height: 20, fontSize: 11 }} />
                    </TableCell>
                    <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12 }}>{r.circular || '—'}</TableCell>
                    <TableCell sx={{ fontSize: 12 }}>{r.note || '—'}</TableCell>
                  </TableRow>
                ))}
                {data.revisions.length === 0 && (
                  <TableRow><TableCell colSpan={6}>
                    <Typography sx={{ py: 3, textAlign: 'center' }} color="text.secondary">No published revision on record for this head.</Typography>
                  </TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <Divider sx={{ mt: 2 }} />
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Fictional demo tariff schedule — circular references are illustrative.
          </Typography>
        </>
      )}
    </FormDrawer>
  );
}
