import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Tabs, Tab, Table, TableHead, TableRow, TableCell, TableBody,
  Button, Skeleton, Stack, Chip, Divider, TextField, MenuItem, Avatar, Checkbox, Tooltip,
  Dialog, DialogTitle, DialogContent, DialogActions, TableContainer, Badge,
} from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import AddTaskRoundedIcon from '@mui/icons-material/AddTaskRounded';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import EntityHover from '../../components/common/EntityHover';
import FormFields from '../../components/common/FormFields';
import { INCIDENT_STATUS_META, SEVERITY_META, TASK_STATUS_META } from '../../utils/status';
import { fmtDT, fromNow } from '../../utils/format';

const tcase = (v) => String(v || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const TRANSITION_LABEL = {
  ACKNOWLEDGED: 'Acknowledge', RESPONDING: 'Start response', MONITORING: 'Move to monitoring',
  RESOLVED: 'Resolve', CLOSED: 'Close case',
};
const REOPEN_FROM = ['RESOLVED', 'CLOSED'];

const Item = ({ label, value }) => (
  <Box>
    <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>{label}</Typography>
    <Typography component="div" sx={{ fontSize: 13.5, fontWeight: 600, mt: 0.25 }}>{value ?? '—'}</Typography>
  </Box>
);

const CHANNEL_COLOR = { VHF: '#0B4F8A', PHONE: '#2C6E52', EMAIL: '#8A5A2B', PORTAL: '#5A6B78', PATROL: '#9C6412', CCTV: '#75479C', AIS: '#0797A5' };

export default function IncidentCase() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [inc, setInc] = useState(null);
  const [meta, setMeta] = useState({});
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [transDlg, setTransDlg] = useState(null);   // { to }
  const [transNote, setTransNote] = useState('');
  const [commText, setCommText] = useState('');
  const [commChannel, setCommChannel] = useState('PORTAL');
  const [commDirection, setCommDirection] = useState('INTERNAL');
  const [docVals, setDocVals] = useState({});
  const [taskVals, setTaskVals] = useState({});
  const [logText, setLogText] = useState('');
  const [rcaVals, setRcaVals] = useState({});

  const err = (e) => dispatch(notify({ message: e.message, severity: 'error' }));
  const load = useCallback(() => api.get(`/incidents/${id}`).then((r) => { setInc(r.data); setRcaVals(r.data.rca || {}); }).catch(err), [id]); // eslint-disable-line
  useEffect(() => { load(); api.get('/meta').then((r) => setMeta(r.data)).catch(() => {}); }, [load]);

  if (!inc) return <Skeleton variant="rounded" height={480} />;
  const canManage = hasPerm(user, 'incidents.manage');
  const allowed = (meta.incidentTransitions || {})[inc.status] || [];
  const isLive = !['RESOLVED', 'CLOSED'].includes(inc.status);

  const doTransition = () => {
    setBusy(true);
    api.post(`/incidents/${id}/transition`, { to: transDlg.to, note: transNote })
      .then(() => { dispatch(notify(`Case moved to ${tcase(transDlg.to)}`)); setTransDlg(null); setTransNote(''); load(); })
      .catch(err).finally(() => setBusy(false));
  };
  const post = (url, body, after) => {
    setBusy(true);
    api.post(url, body).then(() => { after?.(); load(); }).catch(err).finally(() => setBusy(false));
  };

  const timeline = [
    ...(inc.statusHistory || []).map((h) => ({ at: h.at, kind: 'STATUS', who: h.by, text: `${h.from || 'New'} → ${h.to}${h.note ? ` — ${h.note}` : ''}` })),
    ...(inc.log || []).map((l) => ({ at: l.at, kind: 'LOG', who: l.by, text: l.entry })),
    ...(inc.documents || []).map((d2) => ({ at: d2.at, kind: 'DOC', who: d2.uploadedBy, text: `Attached ${d2.name}` })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  const openTasks = (inc.tasks || []).filter((t) => t.status === 'OPEN').length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Incidents', to: '/incidents' }, { label: inc.number }]}
        title={<Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
          <span>{inc.number}</span>
          <StatusChip value={inc.severity} map={SEVERITY_META} />
          <StatusChip value={inc.status} map={INCIDENT_STATUS_META} />
          <Chip size="small" variant="outlined" label={inc.priority} sx={{ height: 20, fontWeight: 700 }} />
        </Stack>}
        sub={inc.title}
        actions={canManage && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {allowed.map((to) => (
              <Button key={to} size="small"
                variant={['RESOLVED', 'CLOSED'].includes(to) ? 'contained' : 'outlined'}
                color={to === 'CLOSED' ? 'success' : REOPEN_FROM.includes(inc.status) && to === 'RESPONDING' ? 'warning' : 'primary'}
                onClick={() => { setTransDlg({ to }); setTransNote(''); }}>
                {REOPEN_FROM.includes(inc.status) && to === 'RESPONDING' ? 'Reopen' : TRANSITION_LABEL[to] || tcase(to)}
              </Button>
            ))}
          </Stack>
        )}
      />

      <Card sx={{ p: 2.5, mb: 2 }}>
        <Grid container spacing={2.5}>
          <Grid item xs={6} md={2.4}><Item label="Category / type" value={`${tcase(inc.category)} · ${tcase(inc.type)}`} /></Grid>
          <Grid item xs={6} md={2.4}><Item label="Reported" value={<span title={fmtDT(inc.reportedAt)}>{fromNow(inc.reportedAt)}</span>} /></Grid>
          <Grid item xs={6} md={2.4}><Item label="Reported by" value={`${inc.reportedBy || '—'} · via ${inc.source}`} /></Grid>
          <Grid item xs={6} md={2.4}>
            <Item label="Case officer" value={inc.assignedTo?.userId
              ? <EntityHover type="user" id={inc.assignedTo.userId}><span>{inc.assignedTo.name}</span></EntityHover>
              : (inc.assignedTo?.name || 'Unassigned')} />
          </Grid>
          <Grid item xs={6} md={2.4}>
            <Item label="Location" value={<Stack direction="row" spacing={0.5} alignItems="center">
              <PlaceRoundedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
              <span>{inc.berth ? `${inc.berth.code} — ${inc.berth.terminal}` : (inc.location?.area || '—')}</span>
            </Stack>} />
          </Grid>
          <Grid item xs={6} md={2.4}>
            <Item label="Vessel / craft" value={inc.vessel
              ? <EntityHover type="vessel" id={inc.vessel._id}><span>{inc.vessel.name}</span></EntityHover>
              : (inc.vesselName || '—')} />
          </Grid>
          <Grid item xs={6} md={2.4}><Item label="Weather" value={inc.weather?.windKn ? `Wind ${inc.weather.windKn} kn · sea state ${inc.weather.seaState}` : '—'} /></Grid>
          <Grid item xs={6} md={2.4}><Item label="Injuries" value={String(inc.injuries || 0)} /></Grid>
          <Grid item xs={6} md={2.4}><Item label="Pollution tier" value={inc.pollutionTier ? `Tier ${inc.pollutionTier}` : 'None'} /></Grid>
          <Grid item xs={6} md={2.4}><Item label="Assets tasked" value={(inc.assets || []).join(', ') || '—'} /></Grid>
          {inc.description && <Grid item xs={12}><Item label="First information" value={inc.description} /></Grid>}
        </Grid>
      </Card>

      <Card>
        <Tabs value={tab} onChange={(_, t) => setTab(t)} variant="scrollable" allowScrollButtonsMobile
          sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label={`Communications (${(inc.comms || []).length})`} />
          <Tab label={<Badge color="warning" badgeContent={openTasks} sx={{ '& .MuiBadge-badge': { right: -10 } }}>Tasks & response</Badge>} />
          <Tab label={`Documents (${(inc.documents || []).length})`} />
          <Tab label="Timeline & logs" />
          <Tab label="RCA & closure" />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ p: 2.5 }}>
            {canManage && isLive && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2.5 }}>
                <TextField select size="small" label="Channel" value={commChannel} onChange={(e) => setCommChannel(e.target.value)} sx={{ width: 120 }}>
                  {(meta.incidentSources || ['PORTAL']).map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </TextField>
                <TextField select size="small" label="Direction" value={commDirection} onChange={(e) => setCommDirection(e.target.value)} sx={{ width: 130 }}>
                  {['IN', 'OUT', 'INTERNAL'].map((d2) => <MenuItem key={d2} value={d2}>{tcase(d2)}</MenuItem>)}
                </TextField>
                <TextField size="small" fullWidth placeholder="Record a message, call or radio exchange…" value={commText}
                  onChange={(e) => setCommText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && commText.trim()) post(`/incidents/${id}/comms`, { channel: commChannel, direction: commDirection, message: commText.trim() }, () => setCommText('')); }} />
                <Button variant="contained" endIcon={<SendRoundedIcon />} disabled={busy || !commText.trim()}
                  onClick={() => post(`/incidents/${id}/comms`, { channel: commChannel, direction: commDirection, message: commText.trim() }, () => setCommText(''))}>
                  Log
                </Button>
              </Stack>
            )}
            <Stack spacing={1.5}>
              {[...(inc.comms || [])].sort((a, b) => new Date(b.at) - new Date(a.at)).map((c) => (
                <Box key={c._id} sx={{ display: 'flex', gap: 1.5 }}>
                  <Avatar sx={{ width: 34, height: 34, fontSize: 12.5, fontWeight: 700, bgcolor: CHANNEL_COLOR[c.channel] || 'grey.600' }}>
                    {c.channel.slice(0, 3)}
                  </Avatar>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="baseline" flexWrap="wrap" useFlexGap>
                      <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{c.by}</Typography>
                      <Chip size="small" variant="outlined" label={c.direction === 'IN' ? 'Received' : c.direction === 'OUT' ? 'Sent' : 'Internal note'} sx={{ height: 17, fontSize: 9.5 }} />
                      <Typography variant="caption" color="text.secondary" title={fmtDT(c.at)}>{fromNow(c.at)}</Typography>
                    </Stack>
                    <Typography sx={{ fontSize: 13.5, mt: 0.25 }}>{c.message}</Typography>
                  </Box>
                </Box>
              ))}
              {(inc.comms || []).length === 0 && <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>No communications recorded yet.</Typography>}
            </Stack>
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 2.5 }}>
            {canManage && isLive && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
                <TextField size="small" fullWidth label="New response task" value={taskVals.title || ''}
                  onChange={(e) => setTaskVals((v) => ({ ...v, title: e.target.value }))} />
                <TextField size="small" label="Assignee" value={taskVals.assignee || ''} sx={{ minWidth: 170 }}
                  onChange={(e) => setTaskVals((v) => ({ ...v, assignee: e.target.value }))} />
                <TextField size="small" type="date" label="Due" InputLabelProps={{ shrink: true }} value={taskVals.due || ''} sx={{ minWidth: 150 }}
                  onChange={(e) => setTaskVals((v) => ({ ...v, due: e.target.value }))} />
                <Button variant="contained" startIcon={<AddTaskRoundedIcon />} disabled={busy || !taskVals.title}
                  onClick={() => post(`/incidents/${id}/tasks`, taskVals, () => setTaskVals({}))}>Add</Button>
              </Stack>
            )}
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead><TableRow>
                  <TableCell width={40}>Done</TableCell><TableCell>Task</TableCell><TableCell>Assignee</TableCell>
                  <TableCell>Due</TableCell><TableCell>Status</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {(inc.tasks || []).map((t) => (
                    <TableRow key={t._id} sx={{ opacity: t.status === 'DONE' ? 0.62 : 1 }}>
                      <TableCell padding="checkbox">
                        <Checkbox size="small" checked={t.status === 'DONE'} disabled={!canManage || busy}
                          onChange={(e) => { setBusy(true); api.put(`/incidents/${id}/tasks/${t._id}`, { status: e.target.checked ? 'DONE' : 'OPEN' }).then(load).catch(err).finally(() => setBusy(false)); }} />
                      </TableCell>
                      <TableCell sx={{ textDecoration: t.status === 'DONE' ? 'line-through' : 'none', fontWeight: 600 }}>{t.title}</TableCell>
                      <TableCell>{t.assignee || '—'}</TableCell>
                      <TableCell>{t.due ? fmtDT(t.due).slice(0, 11) : '—'}</TableCell>
                      <TableCell><StatusChip value={t.status} map={TASK_STATUS_META} /></TableCell>
                    </TableRow>
                  ))}
                  {(inc.tasks || []).length === 0 && (
                    <TableRow><TableCell colSpan={5}><Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>No response tasks yet.</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ p: 2.5 }}>
            {canManage && isLive && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
                <TextField size="small" fullWidth label="Document name (with extension)" value={docVals.name || ''}
                  onChange={(e) => setDocVals((v) => ({ ...v, name: e.target.value }))} placeholder="e.g. site-photographs.zip" />
                <TextField select size="small" label="Type" value={docVals.docType || 'REPORT'} sx={{ minWidth: 140 }}
                  onChange={(e) => setDocVals((v) => ({ ...v, docType: e.target.value }))}>
                  {['REPORT', 'PHOTO', 'STATEMENT', 'SAMPLE', 'PERMIT', 'CCTV', 'OTHER'].map((d2) => <MenuItem key={d2} value={d2}>{tcase(d2)}</MenuItem>)}
                </TextField>
                <Button variant="contained" startIcon={<AttachFileRoundedIcon />} disabled={busy || !docVals.name}
                  onClick={() => post(`/incidents/${id}/documents`, { ...docVals, sizeKB: Math.round(200 + Math.random() * 4000) }, () => setDocVals({}))}>
                  Attach
                </Button>
              </Stack>
            )}
            <Grid container spacing={1.5}>
              {(inc.documents || []).map((d2) => (
                <Grid item xs={12} sm={6} md={4} key={d2._id}>
                  <Card variant="outlined" sx={{ p: 1.5, display: 'flex', gap: 1.25, alignItems: 'center' }}>
                    <InsertDriveFileRoundedIcon sx={{ color: 'text.secondary' }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Tooltip title={d2.name}><Typography noWrap sx={{ fontSize: 13, fontWeight: 600 }}>{d2.name}</Typography></Tooltip>
                      <Typography variant="caption" color="text.secondary">
                        {tcase(d2.docType)} · {d2.sizeKB > 1024 ? `${(d2.sizeKB / 1024).toFixed(1)} MB` : `${d2.sizeKB} KB`} · {d2.uploadedBy} · {fromNow(d2.at)}
                      </Typography>
                    </Box>
                  </Card>
                </Grid>
              ))}
              {(inc.documents || []).length === 0 && (
                <Grid item xs={12}><Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>No documents attached.</Typography></Grid>
              )}
            </Grid>
          </Box>
        )}

        {tab === 3 && (
          <Box sx={{ p: 2.5 }}>
            {canManage && isLive && (
              <Stack direction="row" spacing={1} sx={{ mb: 2.5 }}>
                <TextField size="small" fullWidth placeholder="Add an operational log entry…" value={logText}
                  onChange={(e) => setLogText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && logText.trim()) post(`/incidents/${id}/log`, { entry: logText.trim() }, () => setLogText('')); }} />
                <Button variant="outlined" disabled={busy || !logText.trim()}
                  onClick={() => post(`/incidents/${id}/log`, { entry: logText.trim() }, () => setLogText(''))}>Add entry</Button>
              </Stack>
            )}
            <Stack spacing={0}>
              {timeline.map((t, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1.5, position: 'relative', pb: i === timeline.length - 1 ? 0 : 2 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', mt: 0.6, flexShrink: 0,
                      bgcolor: t.kind === 'STATUS' ? 'primary.main' : t.kind === 'DOC' ? 'success.main' : 'text.disabled' }} />
                    {i !== timeline.length - 1 && <Box sx={{ width: '2px', flex: 1, bgcolor: 'divider', mt: 0.5 }} />}
                  </Box>
                  <Box sx={{ pb: 0.5, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: t.kind === 'STATUS' ? 700 : 500 }}>{t.text}</Typography>
                    <Typography variant="caption" color="text.secondary">{t.who} · {fmtDT(t.at)}</Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Box>
        )}

        {tab === 4 && (
          <Box sx={{ p: 2.5, maxWidth: 860 }}>
            {['RESOLVED', 'CLOSED'].includes(inc.status) && inc.outcome && (
              <Card variant="outlined" sx={{ p: 2, mb: 2, borderColor: 'success.main' }}>
                <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'success.main' }}>Outcome</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 600, mt: 0.5 }}>{inc.outcome}</Typography>
                <Typography variant="caption" color="text.secondary">
                  Resolved {inc.resolvedAt ? fmtDT(inc.resolvedAt) : '—'}{inc.closedAt ? ` · closed ${fmtDT(inc.closedAt)}` : ''}
                </Typography>
              </Card>
            )}
            <FormFields
              fields={[
                { name: 'rootCause', label: 'Root cause', cols: 12, disabled: !canManage || !isLive },
                { name: 'category', label: 'RCA category', type: 'select', disabled: !canManage || !isLive,
                  options: ['Human factor', 'Equipment', 'Procedure', 'Weather', 'External'].map((c) => ({ value: c, label: c })) },
                { name: 'correctiveAction', label: 'Corrective action (what fixed it)', type: 'multiline', rows: 2, cols: 12, disabled: !canManage || !isLive },
                { name: 'preventiveAction', label: 'Preventive action (what stops recurrence)', type: 'multiline', rows: 2, cols: 12, disabled: !canManage || !isLive },
              ]}
              values={rcaVals} onChange={setRcaVals}
            />
            {canManage && isLive && (
              <Button variant="contained" sx={{ mt: 2 }} disabled={busy}
                onClick={() => { setBusy(true); api.put(`/incidents/${id}`, { rca: rcaVals }).then(() => { dispatch(notify('RCA saved')); load(); }).catch(err).finally(() => setBusy(false)); }}>
                Save RCA
              </Button>
            )}
            <Divider sx={{ my: 2.5 }} />
            <Typography variant="caption" color="text.secondary">
              Lifecycle: OPEN → ACKNOWLEDGED → RESPONDING → MONITORING → RESOLVED → CLOSED. A resolved or closed case can be reopened;
              closing is reserved for the HSE chief after RCA review. Every step lands in the audit log.
            </Typography>
          </Box>
        )}
      </Card>

      <Dialog open={!!transDlg} onClose={() => !busy && setTransDlg(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{transDlg && (REOPEN_FROM.includes(inc.status) && transDlg.to === 'RESPONDING' ? `Reopen ${inc.number}?` : `${TRANSITION_LABEL[transDlg.to] || tcase(transDlg?.to)} — ${inc.number}`)}</DialogTitle>
        <DialogContent sx={{ pt: '10px !important' }}>
          <TextField autoFocus fullWidth size="small" multiline minRows={2}
            label={transDlg?.to === 'RESOLVED' ? 'Resolution summary (required)' : 'Note (optional)'}
            value={transNote} onChange={(e) => setTransNote(e.target.value)} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setTransDlg(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" onClick={doTransition} disabled={busy || (transDlg?.to === 'RESOLVED' && !transNote.trim())}>Confirm</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
