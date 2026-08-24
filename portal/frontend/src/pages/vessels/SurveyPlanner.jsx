import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Card, Box, Typography, Skeleton, Stack, Chip, Tooltip, TextField, InputAdornment } from '@mui/material';
import EventRepeatRoundedIcon from '@mui/icons-material/EventRepeatRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import PageHeader from '../../components/common/PageHeader';

/* Class survey & dry-dock planner — one lane per vessel, 24-month horizon.
 * The signature class-status screen: annuals, intermediate, special survey
 * and docking windows, coloured by how close (or overdue) each one is. */

const TYPE_LABEL = { ANNUAL: 'Annual', INTERMEDIATE: 'Intermediate', SPECIAL: 'Special survey', DRY_DOCK: 'Dry dock' };
const STATUS_COLOR = { OVERDUE: '#B3452E', WINDOW_OPEN: '#B77817', PLANNED: '#0797A5' };

export default function SurveyPlanner() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const mode = useSelector((s) => s.ui.mode);
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/vessels/survey-planner').then((r) => setData(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, [dispatch]);

  if (!data) return <><PageHeader icon={EventRepeatRoundedIcon} iconColor="#3B6FB6" title="Class Survey & Dry-Dock Planner" sub="Loading…" /><Skeleton variant="rounded" height={520} /></>;

  const start = new Date(data.from).getTime();
  const end = new Date(data.to).getTime();
  const total = end - start;
  const pctOf = (d) => Math.min(100, Math.max(0, ((new Date(d).getTime() - start) / total) * 100));
  const nowPct = pctOf(new Date());

  const monthTicks = [];
  const cur = new Date(start); cur.setDate(1);
  while (cur.getTime() < end) {
    monthTicks.push({ pct: pctOf(cur), label: cur.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) });
    cur.setMonth(cur.getMonth() + 1);
  }

  const lanes = data.lanes.filter((l) => !q || l.vessel.name.toLowerCase().includes(q.toLowerCase()) || l.vessel.imo.includes(q));
  const overdueCount = data.lanes.reduce((s, l) => s + l.events.filter((e) => e.status === 'OVERDUE').length, 0);
  const rowH = 44;

  return (
    <>
      <PageHeader
        icon={EventRepeatRoundedIcon} iconColor="#3B6FB6"
        title="Class Survey & Dry-Dock Planner"
        sub={`${data.lanes.length} vessels · 24-month horizon · annual / intermediate / special survey & dry-dock windows`}
        actions={(
          <Stack direction="row" spacing={1.5} alignItems="center">
            {overdueCount > 0 && <Chip size="small" color="error" label={`${overdueCount} overdue`} />}
            <TextField size="small" placeholder="Search vessel or IMO" value={q} onChange={(e) => setQ(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }} sx={{ width: 220 }} />
          </Stack>
        )}
      />

      <Card sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex' }}>
          <Box sx={{ width: 190, flexShrink: 0, borderRight: 1, borderColor: 'divider' }}>
            <Box sx={{ height: 32, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', px: 1.5 }}>
              <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10, letterSpacing: '0.08em', color: 'text.secondary', textTransform: 'uppercase' }}>Vessel</Typography>
            </Box>
            {lanes.map((l) => (
              <Box key={l.vessel._id} onClick={() => navigate(`/vessels/${l.vessel._id}`)}
                sx={{ height: rowH, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', px: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 12, fontWeight: 700, lineHeight: 1.25 }}>{l.vessel.name}</Typography>
                  <Typography sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.2 }}>{l.vessel.classSociety || '—'} · IMO {l.vessel.imo}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
          <Box sx={{ flex: 1, position: 'relative', overflowX: 'auto' }}>
            <Box sx={{ minWidth: 1100, position: 'relative' }}>
              <Box sx={{ height: 32, borderBottom: 1, borderColor: 'divider', position: 'relative' }}>
                {monthTicks.map((t, i) => (
                  <Box key={i} sx={{ position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0, borderLeft: `1px dashed ${mode === 'dark' ? '#1E3844' : '#E4EAE9'}`, pl: 0.5, display: 'flex', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap' }}>{t.label}</Typography>
                  </Box>
                ))}
              </Box>
              <Box sx={{ position: 'relative' }}>
                {lanes.map((l) => (
                  <Box key={l.vessel._id} sx={{ height: rowH, borderBottom: 1, borderColor: 'divider', position: 'relative' }}>
                    {monthTicks.map((t, i) => <Box key={i} sx={{ position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0, borderLeft: `1px dashed ${mode === 'dark' ? '#1E3844' : '#E4EAE9'}` }} />)}
                    {l.events.map((e, i) => {
                      const winStart = pctOf(e.window.from);
                      const winEnd = pctOf(e.window.to);
                      const duePct = pctOf(e.due);
                      const color = STATUS_COLOR[e.status];
                      return (
                        <Tooltip key={i} title={`${TYPE_LABEL[e.type]} — due ${new Date(e.due).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} (${e.status.replace('_', ' ')})`}>
                          <Box sx={{ position: 'absolute', left: `${winStart}%`, width: `${Math.max(0.5, winEnd - winStart)}%`, top: 10, bottom: 10, borderRadius: '4px', bgcolor: color, opacity: e.type === 'DRY_DOCK' ? 0.9 : 0.28, border: e.type === 'DRY_DOCK' ? 'none' : `1px solid ${color}` }} />
                        </Tooltip>
                      );
                    })}
                    {l.events.map((e, i) => (
                      <Box key={`d${i}`} sx={{ position: 'absolute', left: `${pctOf(e.due)}%`, top: 6, bottom: 6, width: '2px', bgcolor: STATUS_COLOR[e.status] }} />
                    ))}
                  </Box>
                ))}
                {nowPct >= 0 && nowPct <= 100 && (
                  <Box sx={{ position: 'absolute', left: `${nowPct}%`, top: 0, bottom: 0, width: '2px', bgcolor: '#B3452E', zIndex: 2 }} />
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      </Card>
      <Stack direction="row" spacing={2.5} sx={{ mt: 1.5 }}>
        {Object.entries(STATUS_COLOR).map(([k, c]) => (
          <Stack key={k} direction="row" spacing={0.75} alignItems="center">
            <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: c }} />
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{k.replace('_', ' ')}</Typography>
          </Stack>
        ))}
        <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>· Solid blocks are dry-dock windows; outlined blocks are surveys; the line marks the due date.</Typography>
      </Stack>
    </>
  );
}
