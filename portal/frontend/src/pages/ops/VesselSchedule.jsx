import { useEffect, useMemo, useState } from 'react';
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Card, Box, Typography, Stack, Skeleton, Chip, ToggleButtonGroup, ToggleButton,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Divider,
} from '@mui/material';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import PageHeader from '../../components/common/PageHeader';
import EntityHover from '../../components/common/EntityHover';
import StatusChip from '../../components/common/StatusChip';
import { PORTCALL_STATUS_META } from '../../utils/status';

/* Day-wise arrivals / berthings / sailings board — the daily vessel programme. */

const KIND_META = {
  ARRIVAL: { label: 'Arrival', color: '#0B74B0' },
  BERTHING: { label: 'Berthing', color: '#0797A5' },
  SAILING: { label: 'Sailing (planned)', color: '#9C6412' },
  SAILED: { label: 'Sailed', color: '#5A6B78' },
};

export default function VesselSchedule() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [days, setDays] = useState(5);
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.get('/ops/schedule', { params: { days } }).then((r) => setData(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, [days, dispatch]);

  const byDay = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    for (const e of data.events) {
      const d = new Date(e.at);
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, { date: d, events: [] });
      map.get(key).events.push(e);
    }
    return [...map.values()].sort((a, b) => a.date - b.date);
  }, [data]);

  const dayLabel = (d) => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const that = new Date(d); that.setHours(0, 0, 0, 0);
    const diff = Math.round((that - today) / 86400000);
    const base = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    return diff === 0 ? `Today — ${base}` : diff === -1 ? `Yesterday — ${base}` : diff === 1 ? `Tomorrow — ${base}` : base;
  };

  return (
    <>
      <PageHeader
        icon={EventNoteRoundedIcon} iconColor="#0797A5" title="Vessel schedule" sub="The daily programme — expected arrivals, planned berthings and sailings, and what actually sailed"
        actions={(
          <ToggleButtonGroup exclusive size="small" value={days} onChange={(_, v) => v && setDays(v)}>
            <ToggleButton value={3}>3 days</ToggleButton>
            <ToggleButton value={5}>5 days</ToggleButton>
            <ToggleButton value={7}>7 days</ToggleButton>
          </ToggleButtonGroup>
        )}
      />
      {!data ? <Skeleton variant="rounded" height={480} /> : (
        <Stack spacing={2}>
          {byDay.map(({ date, events }) => (
            <Card key={date.toISOString()}>
              <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="h6" sx={{ fontSize: 14.5 }}>{dayLabel(date)}</Typography>
                <Chip size="small" variant="outlined" label={`${events.length} movement${events.length > 1 ? 's' : ''}`} sx={{ height: 20, fontSize: 10.5 }} />
              </Box>
              <Divider />
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead><TableRow>
                    <TableCell width={80}>Time</TableCell><TableCell width={130}>Movement</TableCell><TableCell>Vessel</TableCell>
                    <TableCell>VCN</TableCell><TableCell>Berth</TableCell><TableCell>Agent</TableCell><TableCell>Call status</TableCell>
                  </TableRow></TableHead>
                  <TableBody>
                    {events.map((e, i) => (
                      <TableRow key={`${e.callId}-${e.kind}-${i}`} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/port-calls/${e.callId}`)}>
                        <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5, whiteSpace: 'nowrap' }}>
                          {new Date(e.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          {e.planned && <Typography component="span" variant="caption" color="text.secondary"> est</Typography>}
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={KIND_META[e.kind].label}
                            sx={{ height: 20, fontSize: 10.5, fontWeight: 700, color: '#fff', bgcolor: KIND_META[e.kind].color }} />
                        </TableCell>
                        <TableCell onClick={(ev) => ev.stopPropagation()}>
                          <EntityHover type="vessel" id={e.vesselId}><b>{e.vessel}</b></EntityHover>
                        </TableCell>
                        <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12 }}>{e.vcn}</TableCell>
                        <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12 }}>{e.berth}</TableCell>
                        <TableCell>{e.agent || '—'}</TableCell>
                        <TableCell><StatusChip value={e.status} map={PORTCALL_STATUS_META} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          ))}
          {byDay.length === 0 && (
            <Card sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No movements in this window.</Typography></Card>
          )}
        </Stack>
      )}
    </>
  );
}
