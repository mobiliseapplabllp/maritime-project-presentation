import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Box, Typography, Skeleton, Stack, Button, Tooltip, Chip, ButtonGroup,
} from '@mui/material';
import ViewTimelineRoundedIcon from '@mui/icons-material/ViewTimelineRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import PageHeader from '../../components/common/PageHeader';

/* Berth window planner — every berth as a lane, every call as a block.
 * Time runs left to right; unallocated inbound calls sit in a side rail
 * you can jump into the register from to assign a berth. */

const HOUR = 3600 * 1000;
const TERM_COLOR = { CONTAINER: '#0797A5', BULK: '#9C6412', MULTIPURPOSE: '#3B6FB6', LIQUID: '#BD3861', RORO: '#75479C', SPM: '#2C6E52', COAL: '#5A4632' };

export default function BerthPlanner() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const mode = useSelector((s) => s.ui.mode);
  const [data, setData] = useState(null);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1); return d; });
  const days = 6;

  const load = (f) => {
    api.get('/ops/berth-plan', { params: { from: f.toISOString(), days } })
      .then((r) => setData(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  };
  useEffect(() => { load(from); }, [from]); // eslint-disable-line

  const span = useMemo(() => {
    if (!data) return null;
    const start = new Date(data.window.from).getTime();
    const end = new Date(data.window.to).getTime();
    return { start, end, totalMs: end - start };
  }, [data]);

  if (!data || !span) {
    return <><PageHeader icon={ViewTimelineRoundedIcon} iconColor="#0797A5" title="Berth Window Planner" sub="Loading…" /><Skeleton variant="rounded" height={520} /></>;
  }

  const pctOf = (d) => {
    const t = Math.min(Math.max(new Date(d).getTime(), span.start), span.end);
    return ((t - span.start) / span.totalMs) * 100;
  };
  const nowPct = pctOf(new Date());
  const conflictBerths = new Set(data.conflicts.map((c) => c.berth));

  // day gridlines + labels
  const dayTicks = [];
  for (let t = span.start; t <= span.end; t += 24 * HOUR) {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < span.start) continue;
    dayTicks.push({ pct: pctOf(d), label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) });
  }

  const rowH = 46;
  const grid = mode === 'dark' ? '#1E3844' : '#E4EAE9';
  const paper = mode === 'dark' ? '#122A36' : '#FFFFFF';

  return (
    <>
      <PageHeader
        icon={ViewTimelineRoundedIcon} iconColor="#0797A5"
        title="Berth Window Planner"
        sub={`${data.berths.length} berths · ${new Date(data.window.from).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(data.window.to).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
        actions={(
          <Stack direction="row" spacing={1} alignItems="center">
            {data.conflicts.length > 0 && (
              <Chip size="small" color="error" icon={<WarningAmberRoundedIcon sx={{ fontSize: 15 }} />}
                label={`${data.conflicts.length} berth conflict${data.conflicts.length > 1 ? 's' : ''}`} />
            )}
            <ButtonGroup size="small" variant="outlined">
              <Button onClick={() => setFrom((f) => new Date(f.getTime() - 2 * 24 * HOUR))}><ChevronLeftRoundedIcon fontSize="small" /></Button>
              <Button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 1); setFrom(d); }}>Today</Button>
              <Button onClick={() => setFrom((f) => new Date(f.getTime() + 2 * 24 * HOUR))}><ChevronRightRoundedIcon fontSize="small" /></Button>
            </ButtonGroup>
          </Stack>
        )}
      />

      <Card sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ display: 'flex' }}>
          {/* berth label column */}
          <Box sx={{ width: 168, flexShrink: 0, borderRight: 1, borderColor: 'divider' }}>
            <Box sx={{ height: 34, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', px: 1.5 }}>
              <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10, letterSpacing: '0.08em', color: 'text.secondary', textTransform: 'uppercase' }}>Berth</Typography>
            </Box>
            {data.berths.map((b) => (
              <Box key={b._id} sx={{ height: rowH, borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', px: 1.5, gap: 1 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '3px', bgcolor: TERM_COLOR[b.berthType] || '#999', flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 12.5, fontWeight: 700, lineHeight: 1.2 }}>{b.code}</Typography>
                  <Typography noWrap sx={{ fontSize: 10, color: 'text.secondary', lineHeight: 1.2 }}>{b.terminal}</Typography>
                </Box>
                {conflictBerths.has(String(b._id)) && <WarningAmberRoundedIcon sx={{ fontSize: 14, color: 'error.main', ml: 'auto' }} />}
              </Box>
            ))}
          </Box>

          {/* timeline */}
          <Box sx={{ flex: 1, position: 'relative', overflowX: 'auto' }}>
            <Box sx={{ minWidth: 900, position: 'relative' }}>
              {/* day header */}
              <Box sx={{ height: 34, borderBottom: 1, borderColor: 'divider', position: 'relative' }}>
                {dayTicks.map((t, i) => (
                  <Box key={i} sx={{ position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0, borderLeft: `1px dashed ${grid}`, pl: 0.75, display: 'flex', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: 10.5, fontWeight: 700, color: 'text.secondary', whiteSpace: 'nowrap' }}>{t.label}</Typography>
                  </Box>
                ))}
              </Box>
              {/* rows */}
              <Box sx={{ position: 'relative' }}>
                {data.berths.map((b) => {
                  const blocks = data.blocks.filter((bl) => bl.berth === String(b._id));
                  return (
                    <Box key={b._id} sx={{ height: rowH, borderBottom: 1, borderColor: 'divider', position: 'relative', bgcolor: b.status === 'MAINTENANCE' ? (mode === 'dark' ? 'rgba(180,120,20,0.08)' : 'rgba(180,120,20,0.05)') : 'transparent' }}>
                      {dayTicks.map((t, i) => (
                        <Box key={i} sx={{ position: 'absolute', left: `${t.pct}%`, top: 0, bottom: 0, borderLeft: `1px dashed ${grid}` }} />
                      ))}
                      {blocks.map((bl) => {
                        const startPct = pctOf(bl.start);
                        const endPct = bl.end ? pctOf(bl.end) : 100;
                        const w = Math.max(1.2, endPct - startPct);
                        const isConflict = data.conflicts.some((c) => c.berth === bl.berth && (c.a === bl.vcn || c.b === bl.vcn));
                        return (
                          <Tooltip key={bl.id} title={`${bl.vessel ? bl.vessel.name : ''} · ${bl.vcn} · ${bl.status}${bl.actual ? ' (actual)' : ' (planned)'}`}>
                            <Box onClick={() => navigate(`/port-calls/${bl.id}`)}
                              sx={{
                                position: 'absolute', left: `${startPct}%`, width: `${w}%`, top: 6, bottom: 6,
                                borderRadius: '5px', cursor: 'pointer', px: 0.75, display: 'flex', alignItems: 'center', overflow: 'hidden',
                                bgcolor: isConflict ? '#B3452E' : bl.actual ? (TERM_COLOR[b.berthType] || '#0797A5') : 'transparent',
                                border: bl.actual ? 'none' : `1.5px dashed ${TERM_COLOR[b.berthType] || '#0797A5'}`,
                                color: bl.actual ? '#fff' : (TERM_COLOR[b.berthType] || '#0797A5'),
                                boxShadow: isConflict ? '0 0 0 2px rgba(179,69,46,0.35)' : 'none',
                                transition: 'transform .1s', '&:hover': { transform: 'scale(1.015)', zIndex: 2 },
                              }}>
                              <Typography noWrap sx={{ fontSize: 10.5, fontWeight: 700 }}>{bl.vessel ? bl.vessel.name : bl.vcn}</Typography>
                            </Box>
                          </Tooltip>
                        );
                      })}
                    </Box>
                  );
                })}
                {/* now line */}
                {nowPct >= 0 && nowPct <= 100 && (
                  <Box sx={{ position: 'absolute', left: `${nowPct}%`, top: 0, bottom: 0, width: '2px', bgcolor: '#B3452E', zIndex: 3 }}>
                    <Chip label="NOW" size="small" sx={{ position: 'absolute', top: -4, left: 4, height: 16, fontSize: 9, fontWeight: 700, bgcolor: '#B3452E', color: '#fff' }} />
                  </Box>
                )}
              </Box>
            </Box>
          </Box>
        </Box>
      </Card>

      {data.unallocated.length > 0 && (
        <Card sx={{ p: 2, mt: 2 }}>
          <Typography variant="h6" sx={{ fontSize: 14.5, mb: 1 }}>Awaiting berth allocation ({data.unallocated.length})</Typography>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {data.unallocated.map((c) => (
              <Chip key={c.id} clickable onClick={() => navigate(`/port-calls/${c.id}`)}
                label={`${c.vessel ? c.vessel.name : c.vcn} — ETA ${new Date(c.eta).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`}
                variant="outlined" sx={{ fontSize: 11.5 }} />
            ))}
          </Stack>
        </Card>
      )}
    </>
  );
}
