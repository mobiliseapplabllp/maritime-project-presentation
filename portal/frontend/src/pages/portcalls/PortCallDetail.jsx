import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Button, Stack, Tabs, Tab, Table, TableHead, TableRow, TableCell,
  TableBody, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Divider, Chip, Skeleton,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import RequestQuoteRoundedIcon from '@mui/icons-material/RequestQuoteRounded';
import SofDialog from './SofDialog';
import PdaDialog from './PdaDialog';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import FormFields from '../../components/common/FormFields';
import { PORTCALL_STATUS_META } from '../../utils/status';
import { fmtDT, fmtNum, toInputDT } from '../../utils/format';

const Item = ({ label, value }) => (
  <Box>
    <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>{label}</Typography>
    <Typography component="div" sx={{ fontSize: 14, fontWeight: 600, mt: 0.25 }}>{value ?? '—'}</Typography>
  </Box>
);

const NEXT_ACTIONS = {
  ANNOUNCED: [{ to: 'CONFIRMED', label: 'Confirm call' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  CONFIRMED: [{ to: 'AT_ANCHORAGE', label: 'Arrived at anchorage' }, { to: 'BERTHED', label: 'Berth vessel' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  AT_ANCHORAGE: [{ to: 'BERTHED', label: 'Berth vessel' }, { to: 'CANCELLED', label: 'Cancel', danger: true }],
  BERTHED: [{ to: 'SAILED', label: 'Sail vessel' }],
  SAILED: [], CANCELLED: [],
};

export default function PortCallDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [sofOpen, setSofOpen] = useState(false);
  const [pdaOpen, setPdaOpen] = useState(false);
  const [call, setCall] = useState(null);
  const [tab, setTab] = useState(0);
  const [action, setAction] = useState(null);     // {to,label}
  const [actionVals, setActionVals] = useState({});
  const [berthOpts, setBerthOpts] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editVals, setEditVals] = useState({});
  const [svcOpen, setSvcOpen] = useState(false);
  const [svcVals, setSvcVals] = useState({});
  const [tariffs, setTariffs] = useState([]);
  const [cargoOpen, setCargoOpen] = useState(null); // {} new | op
  const [cargoVals, setCargoVals] = useState({});
  const [cargoTypes, setCargoTypes] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get(`/port-calls/${id}`).then((r) => setCall(r.data))
    .catch((e) => dispatch(notify({ message: e.message, severity: 'error' }))), [id, dispatch]);
  useEffect(() => { load(); }, [load]);

  const err = (e) => dispatch(notify({ message: e.message, severity: 'error' }));
  const canTransit = hasPerm(user, 'portcalls.transition');
  const canEdit = hasPerm(user, 'portcalls.edit') && call && !['SAILED', 'CANCELLED'].includes(call.status);
  const canCargo = hasPerm(user, 'cargo.manage') && call && !['SAILED', 'CANCELLED'].includes(call.status);

  const openAction = (a) => {
    setAction(a); setActionVals({ at: toInputDT(new Date()) });
    if (a.to === 'BERTHED') api.get('/berths', { params: { limit: 100, status: 'OPERATIONAL', sort: 'code' } }).then((r) => setBerthOpts(r.data));
  };
  const runAction = () => {
    setBusy(true);
    api.post(`/port-calls/${id}/transition`, { to: action.to, at: actionVals.at, berth: actionVals.berth, note: actionVals.note })
      .then(() => { dispatch(notify(`${action.label} — done`)); setAction(null); load(); })
      .catch(err).finally(() => setBusy(false));
  };

  if (!call) return <Skeleton variant="rounded" height={420} />;

  const v = call.vessel || {};
  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Port calls', to: '/port-calls' }, { label: call.vcn }]}
        title={<>{v.name} <Typography component="span" sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 15, color: 'text.secondary', ml: 1 }}>{call.vcn}</Typography></>}
        sub={`${call.purpose || 'Port call'} · Agent: ${call.agentName || '—'}`}
        actions={
          <>
            <Button variant="outlined" startIcon={<DescriptionRoundedIcon />} onClick={() => setSofOpen(true)}>Statement of Facts</Button>
            <Button variant="outlined" startIcon={<RequestQuoteRoundedIcon />} onClick={() => setPdaOpen(true)}>Cost estimate</Button>
            {hasPerm(user, 'invoices.create') && call.status === 'SAILED' && (
              <Button variant="outlined" startIcon={<ReceiptLongRoundedIcon />} onClick={() => {
                api.post('/invoices/generate', { portCallId: id })
                  .then((r) => { dispatch(notify(`Invoice ${r.data.number} drafted`)); navigate(`/invoices/${r.data._id}`); })
                  .catch(err);
              }}>Generate invoice</Button>
            )}
            {canTransit && NEXT_ACTIONS[call.status].map((a) => (
              <Button key={a.to} variant={a.danger ? 'outlined' : 'contained'} color={a.danger ? 'error' : 'primary'} onClick={() => openAction(a)}>{a.label}</Button>
            ))}
          </>
        }
      />

      <Card sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <StatusChip value={call.status} map={PORTCALL_STATUS_META} size="medium" />
          {call.berth && <Chip size="small" variant="outlined" label={`Berth ${call.berth.code} · ${call.berth.terminal}`} sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 11 }} />}
          {call.detention && <Chip size="small" color="error" label="DETAINED" />}
          <Box sx={{ flex: 1 }} />
          {canEdit && (
            <Button size="small" startIcon={<EditRoundedIcon />} onClick={() => {
              setEditVals({
                eta: toInputDT(call.eta), etb: toInputDT(call.etb), etd: toInputDT(call.etd),
                purpose: call.purpose, prevPort: call.prevPort, nextPort: call.nextPort,
                draftArrival: call.draftArrival ?? '', draftDeparture: call.draftDeparture ?? '',
                crewCount: call.crew?.count ?? '', master: call.crew?.master ?? '', remarks: call.remarks,
              });
              setEditOpen(true);
            }}>Edit details</Button>
          )}
        </Stack>
        <Grid container spacing={2.5} sx={{ mt: 0.25 }}>
          <Grid item xs={6} md={2}><Item label="ETA" value={fmtDT(call.eta)} /></Grid>
          <Grid item xs={6} md={2}><Item label="ATA" value={fmtDT(call.ata)} /></Grid>
          <Grid item xs={6} md={2}><Item label="Berthed (ATB)" value={fmtDT(call.atb)} /></Grid>
          <Grid item xs={6} md={2}><Item label="ETD" value={fmtDT(call.etd)} /></Grid>
          <Grid item xs={6} md={2}><Item label="Sailed (ATD)" value={fmtDT(call.atd)} /></Grid>
          <Grid item xs={6} md={2}><Item label="From → To" value={`${call.prevPort || '—'} → ${call.nextPort || '—'}`} /></Grid>
        </Grid>
      </Card>

      <Card>
        <Tabs value={tab} onChange={(_, t) => setTab(t)} sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Overview" /><Tab label={`Services (${call.services.length})`} />
          <Tab label={`Cargo (${call.cargoOps.length})`} /><Tab label="Timeline" />
        </Tabs>

        {tab === 0 && (
          <Grid container spacing={2.5} sx={{ p: 2.5 }}>
            <Grid item xs={6} md={3}><Item label="Vessel" value={<span>{v.name} <Typography component="span" variant="caption">(IMO {v.imo})</Typography></span>} /></Grid>
            <Grid item xs={6} md={3}><Item label="Type / Flag" value={`${v.type || '—'} · ${v.flag || '—'}`} /></Grid>
            <Grid item xs={6} md={3}><Item label="GRT / DWT" value={`${fmtNum(v.grt)} / ${fmtNum(v.dwt)}`} /></Grid>
            <Grid item xs={6} md={3}><Item label="LOA / Max draft" value={`${v.loa || '—'} m / ${v.maxDraft || '—'} m`} /></Grid>
            <Grid item xs={6} md={3}><Item label="Arrival draft" value={call.draftArrival ? `${call.draftArrival} m` : '—'} /></Grid>
            <Grid item xs={6} md={3}><Item label="Departure draft" value={call.draftDeparture ? `${call.draftDeparture} m` : '—'} /></Grid>
            <Grid item xs={6} md={3}><Item label="Crew / Master" value={`${call.crew?.count || '—'} · ${call.crew?.master || '—'}`} /></Grid>
            <Grid item xs={6} md={3}><Item label="Remarks" value={call.remarks || '—'} /></Grid>
          </Grid>
        )}

        {tab === 1 && (
          <Box sx={{ p: 2 }}>
            {canEdit && (
              <Button size="small" startIcon={<AddRoundedIcon />} sx={{ mb: 1 }} onClick={() => {
                setSvcVals({ qty: 1, at: toInputDT(new Date()) });
                api.get('/tariffs', { params: { limit: 100 } }).then((r) => setTariffs(r.data));
                setSvcOpen(true);
              }}>Add service</Button>
            )}
            <Table size="small">
              <TableHead><TableRow><TableCell>Service</TableCell><TableCell>Description</TableCell><TableCell align="right">Qty</TableCell><TableCell>Unit</TableCell><TableCell>Tariff</TableCell><TableCell>When</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {call.services.map((s) => (
                  <TableRow key={s._id}>
                    <TableCell><b>{s.type.replace(/_/g, ' ')}</b></TableCell>
                    <TableCell>{s.description || '—'}</TableCell>
                    <TableCell align="right">{s.qty}</TableCell><TableCell>{s.unit || '—'}</TableCell>
                    <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12 }}>{s.tariffCode || '—'}</TableCell>
                    <TableCell>{fmtDT(s.at)}</TableCell>
                    <TableCell align="right">
                      {canEdit && <IconButton size="small" color="error" onClick={() => api.delete(`/port-calls/${id}/services/${s._id}`).then(load).catch(err)}><DeleteOutlineRoundedIcon fontSize="inherit" /></IconButton>}
                    </TableCell>
                  </TableRow>
                ))}
                {call.services.length === 0 && <TableRow><TableCell colSpan={7}><Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>No services recorded</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ p: 2 }}>
            {canCargo && (
              <Button size="small" startIcon={<AddRoundedIcon />} sx={{ mb: 1 }} onClick={() => {
                setCargoVals({ operation: 'DISCHARGE', unit: 'MT' });
                api.get('/lookups', { params: { category: 'cargoType', limit: 100 } }).then((r) => setCargoTypes(r.data));
                setCargoOpen({});
              }}>Add cargo operation</Button>
            )}
            <Table size="small">
              <TableHead><TableRow><TableCell>Cargo</TableCell><TableCell>Operation</TableCell><TableCell align="right">Quantity</TableCell><TableCell align="right">≈ MT</TableCell><TableCell align="right">Gangs</TableCell><TableCell>Started</TableCell><TableCell>Completed</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {call.cargoOps.map((o) => (
                  <TableRow key={o._id}>
                    <TableCell><b>{o.cargoType}</b></TableCell>
                    <TableCell><Chip size="small" variant="outlined" label={o.operation} sx={{ height: 20, fontSize: 11 }} /></TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(o.qty)} {o.unit}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{fmtNum(o.qtyMT)}</TableCell>
                    <TableCell align="right">{o.gangs || '—'}</TableCell>
                    <TableCell>{fmtDT(o.startedAt)}</TableCell><TableCell>{fmtDT(o.completedAt)}</TableCell>
                    <TableCell align="right">
                      {canCargo && (
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <IconButton size="small" onClick={() => {
                            setCargoVals({ cargoType: o.cargoType, operation: o.operation, qty: o.qty, unit: o.unit, gangs: o.gangs, startedAt: toInputDT(o.startedAt), completedAt: toInputDT(o.completedAt) });
                            api.get('/lookups', { params: { category: 'cargoType', limit: 100 } }).then((r) => setCargoTypes(r.data));
                            setCargoOpen(o);
                          }}><EditRoundedIcon fontSize="inherit" /></IconButton>
                          <IconButton size="small" color="error" onClick={() => api.delete(`/port-calls/${id}/cargo/${o._id}`).then(load).catch(err)}><DeleteOutlineRoundedIcon fontSize="inherit" /></IconButton>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {call.cargoOps.length === 0 && <TableRow><TableCell colSpan={8}><Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>No cargo operations yet</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Box>
        )}

        {tab === 3 && (
          <Box sx={{ p: 2.5 }}>
            <Stack spacing={0}>
              {[...call.statusHistory].reverse().map((h, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 2 }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: i === 0 ? 'primary.main' : 'divider', mt: 0.75 }} />
                    {i < call.statusHistory.length - 1 && <Box sx={{ width: 2, flex: 1, bgcolor: 'divider' }} />}
                  </Box>
                  <Box sx={{ pb: 2.5 }}>
                    <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>
                      {PORTCALL_STATUS_META[h.to]?.label || h.to}
                      {h.from && <Typography component="span" variant="caption" color="text.secondary"> (from {PORTCALL_STATUS_META[h.from]?.label || h.from})</Typography>}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{fmtDT(h.at)} · by {h.by}{h.note ? ` · ${h.note}` : ''}</Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
          </Box>
        )}
      </Card>

      {/* transition dialog */}
      <Dialog open={!!action} onClose={() => !busy && setAction(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{action?.label}</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <FormFields
            fields={[
              { name: 'at', label: 'When', type: 'datetime', required: true, cols: 12 },
              ...(action?.to === 'BERTHED' ? [{
                name: 'berth', label: 'Berth', type: 'autocomplete', required: true, cols: 12,
                options: berthOpts.map((b) => ({ value: b._id, label: `${b.code} — ${b.terminal} (max ${b.loaMax} m / ${b.draftMax} m)` })),
              }] : []),
              ...(action?.to === 'CANCELLED' ? [{ name: 'note', label: 'Cancellation reason', type: 'multiline', required: true, cols: 12 }] : []),
            ]}
            values={actionVals} onChange={setActionVals}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setAction(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" color={action?.danger ? 'error' : 'primary'} onClick={runAction}
            disabled={busy || (action?.to === 'BERTHED' && !actionVals.berth) || (action?.to === 'CANCELLED' && !actionVals.note)}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      {/* edit details */}
      <Dialog open={editOpen} onClose={() => !busy && setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit call details</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <FormFields
            fields={[
              { name: 'eta', label: 'ETA', type: 'datetime' }, { name: 'etd', label: 'ETD', type: 'datetime' },
              { name: 'purpose', label: 'Purpose' }, { name: 'etb', label: 'ETB', type: 'datetime' },
              { name: 'prevPort', label: 'Last port' }, { name: 'nextPort', label: 'Next port' },
              { name: 'draftArrival', label: 'Arrival draft (m)', type: 'number' }, { name: 'draftDeparture', label: 'Departure draft (m)', type: 'number' },
              { name: 'crewCount', label: 'Crew count', type: 'number' }, { name: 'master', label: 'Master' },
              { name: 'remarks', label: 'Remarks', type: 'multiline', cols: 12 },
            ]}
            values={editVals} onChange={setEditVals}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setEditOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" disabled={busy} onClick={() => {
            setBusy(true);
            api.put(`/port-calls/${id}`, {
              eta: editVals.eta || undefined, etb: editVals.etb || undefined, etd: editVals.etd || undefined,
              purpose: editVals.purpose, prevPort: editVals.prevPort, nextPort: editVals.nextPort,
              draftArrival: editVals.draftArrival === '' ? undefined : editVals.draftArrival,
              draftDeparture: editVals.draftDeparture === '' ? undefined : editVals.draftDeparture,
              crew: { count: editVals.crewCount === '' ? 0 : editVals.crewCount, master: editVals.master },
              remarks: editVals.remarks,
            }).then(() => { dispatch(notify('Call updated')); setEditOpen(false); load(); }).catch(err).finally(() => setBusy(false));
          }}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* add service */}
      <Dialog open={svcOpen} onClose={() => !busy && setSvcOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add service</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <FormFields
            fields={[
              { name: 'type', label: 'Service type', type: 'select', required: true, cols: 12, options: ['PILOTAGE', 'TUGS', 'FRESH_WATER', 'GARBAGE', 'ANCHORAGE', 'MOORING', 'OTHER'].map((s) => ({ value: s, label: s.replace(/_/g, ' ') })) },
              { name: 'tariffCode', label: 'Tariff item', type: 'select', cols: 12, options: tariffs.map((t) => ({ value: t.code, label: `${t.code} — ${t.name} (₹${t.rate} ${t.unit})` })) },
              { name: 'qty', label: 'Quantity', type: 'number', required: true }, { name: 'unit', label: 'Unit' },
              { name: 'at', label: 'When', type: 'datetime', cols: 12 },
              { name: 'description', label: 'Description', cols: 12 },
            ]}
            values={svcVals} onChange={setSvcVals}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setSvcOpen(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" disabled={busy || !svcVals.type || !svcVals.qty} onClick={() => {
            setBusy(true);
            api.post(`/port-calls/${id}/services`, svcVals)
              .then(() => { dispatch(notify('Service added')); setSvcOpen(false); load(); }).catch(err).finally(() => setBusy(false));
          }}>Add</Button>
        </DialogActions>
      </Dialog>

      {/* cargo op */}
      <Dialog open={!!cargoOpen} onClose={() => !busy && setCargoOpen(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{cargoOpen?._id ? 'Edit cargo operation' : 'Add cargo operation'}</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <FormFields
            fields={[
              { name: 'cargoType', label: 'Cargo type', type: 'select', required: true, cols: 12, options: cargoTypes.map((c) => ({ value: c.code, label: c.label })) },
              { name: 'operation', label: 'Operation', type: 'select', required: true, options: [{ value: 'DISCHARGE', label: 'Discharge' }, { value: 'LOAD', label: 'Load' }] },
              { name: 'unit', label: 'Unit', type: 'select', required: true, options: ['MT', 'TEU', 'UNITS'].map((u) => ({ value: u, label: u })) },
              { name: 'qty', label: 'Quantity', type: 'number', required: true },
              { name: 'gangs', label: 'Gangs', type: 'number' },
              { name: 'startedAt', label: 'Started', type: 'datetime' }, { name: 'completedAt', label: 'Completed', type: 'datetime' },
            ]}
            values={cargoVals} onChange={setCargoVals}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setCargoOpen(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" disabled={busy || !cargoVals.cargoType || !cargoVals.qty} onClick={() => {
            setBusy(true);
            const body = { ...cargoVals, startedAt: cargoVals.startedAt || undefined, completedAt: cargoVals.completedAt || undefined };
            const req = cargoOpen?._id ? api.put(`/port-calls/${id}/cargo/${cargoOpen._id}`, body) : api.post(`/port-calls/${id}/cargo`, body);
            req.then(() => { dispatch(notify('Cargo operation saved')); setCargoOpen(null); load(); }).catch(err).finally(() => setBusy(false));
          }}>{cargoOpen?._id ? 'Save' : 'Add'}</Button>
        </DialogActions>
      </Dialog>

      <SofDialog callId={id} open={sofOpen} onClose={() => setSofOpen(false)} />
      <PdaDialog callId={id} open={pdaOpen} onClose={() => setPdaOpen(false)} user={user} />
    </>
  );
}
