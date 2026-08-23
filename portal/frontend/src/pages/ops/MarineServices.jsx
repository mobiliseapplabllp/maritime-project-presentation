import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Stack, Skeleton, Chip, Button, Menu, MenuItem, Divider, Avatar,
} from '@mui/material';
import DirectionsBoatRoundedIcon from '@mui/icons-material/DirectionsBoatRounded';
import SupportRoundedIcon from '@mui/icons-material/SupportRounded';
import PersonPinCircleRoundedIcon from '@mui/icons-material/PersonPinCircleRounded';
import SailingRoundedIcon from '@mui/icons-material/SailingRounded';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import { RESOURCE_STATUS_META } from '../../utils/status';

/* Marine craft & pilot board — the resources behind every berthing:
 * tugs, pilot launches, mooring boats, the pilot roster and the survey launch. */

const TYPE_META = {
  TUG: { label: 'Tugs', icon: DirectionsBoatRoundedIcon, color: '#0797A5' },
  PILOT_LAUNCH: { label: 'Pilot launches', icon: SailingRoundedIcon, color: '#0B74B0' },
  MOORING_BOAT: { label: 'Mooring boats', icon: SupportRoundedIcon, color: '#5A6B78' },
  PILOT: { label: 'Pilot roster', icon: PersonPinCircleRoundedIcon, color: '#75479C' },
  SURVEY_LAUNCH: { label: 'Survey launch', icon: TravelExploreRoundedIcon, color: '#2C6E52' },
};
const ORDER = ['TUG', 'PILOT_LAUNCH', 'MOORING_BOAT', 'PILOT', 'SURVEY_LAUNCH'];

export default function MarineServices() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [rows, setRows] = useState(null);
  const [menu, setMenu] = useState(null);   // { anchor, resource }
  const canEdit = hasPerm(user, 'portcalls.edit');

  const load = () => api.get('/ops/resources').then((r) => setRows(r.data))
    .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  useEffect(() => { load(); }, []); // eslint-disable-line

  const setStatus = (resource, status) => {
    setMenu(null);
    api.put(`/ops/resources/${resource._id}`, { status })
      .then(() => { dispatch(notify(`${resource.name} marked ${RESOURCE_STATUS_META[status].label.toLowerCase()}`)); load(); })
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  };

  if (!rows) return <Skeleton variant="rounded" height={480} />;
  const available = rows.filter((r) => r.status === 'AVAILABLE').length;
  const tasked = rows.filter((r) => r.status === 'TASKED').length;

  return (
    <>
      <PageHeader
        title="Marine craft & pilots"
        sub={`Pilotage runs 24×365 — boarding ground ≈3 NM south-east of the breakwaters · ${available} available · ${tasked} tasked now`}
      />
      <Stack spacing={2.5}>
        {ORDER.map((type) => {
          const group = rows.filter((r) => r.type === type);
          if (!group.length) return null;
          const M2 = TYPE_META[type]; const GIcon = M2.icon;
          return (
            <Box key={type}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <GIcon sx={{ fontSize: 19, color: M2.color }} />
                <Typography variant="h6" sx={{ fontSize: 15 }}>{M2.label}</Typography>
                <Typography variant="caption" color="text.secondary">{group.length} on strength</Typography>
              </Stack>
              <Grid container spacing={1.5}>
                {group.map((r) => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={r._id}>
                    <Card variant="outlined" sx={{ p: 1.75, height: '100%', borderTop: 3, borderTopColor: M2.color }}>
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <Avatar sx={{ width: 38, height: 38, bgcolor: M2.color, fontSize: 13, fontWeight: 700 }}>
                          {r.code.split('-')[1] || r.code.slice(0, 2)}
                        </Avatar>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography noWrap sx={{ fontWeight: 700, fontSize: 14 }}>{r.name}</Typography>
                          <Typography noWrap variant="caption" color="text.secondary">{r.code} · {r.contact || '—'}</Typography>
                        </Box>
                      </Stack>
                      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 1, minHeight: 32 }}>{r.spec}</Typography>
                      {r.master && <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>Master: {r.master}</Typography>}
                      <Divider sx={{ my: 1 }} />
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                        <StatusChip value={r.status} map={RESOURCE_STATUS_META} />
                        {canEdit && (
                          <Button size="small" onClick={(e) => setMenu({ anchor: e.currentTarget, resource: r })}>Set status</Button>
                        )}
                      </Stack>
                      {r.status === 'TASKED' && r.currentTask && (
                        <Chip size="small" variant="outlined" color="info" label={r.currentTask} sx={{ mt: 1, height: 20, fontSize: 10, maxWidth: '100%' }} />
                      )}
                      {r.remarks && <Typography variant="caption" color="warning.main" sx={{ display: 'block', mt: 0.75 }}>{r.remarks}</Typography>}
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          );
        })}
      </Stack>
      <Menu anchorEl={menu?.anchor} open={!!menu} onClose={() => setMenu(null)}>
        {Object.keys(RESOURCE_STATUS_META).map((s) => (
          <MenuItem key={s} selected={menu?.resource.status === s} onClick={() => setStatus(menu.resource, s)}>
            {RESOURCE_STATUS_META[s].label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
