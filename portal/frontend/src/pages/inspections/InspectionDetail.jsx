import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Box, Typography, Button, Stack, Table, TableHead, TableRow, TableCell, TableBody,
  ToggleButtonGroup, ToggleButton, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Skeleton, Chip, Grid, Divider,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import FormFields from '../../components/common/FormFields';
import { INSPECTION_STATUS_META, RESULT_META } from '../../utils/status';
import { fmtDT, toInputD, fmtD } from '../../utils/format';

export default function InspectionDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [doc, setDoc] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [findDlg, setFindDlg] = useState(null);
  const [findVals, setFindVals] = useState({});
  const [defCodes, setDefCodes] = useState([]);
  const [actCodes, setActCodes] = useState([]);
  const [closeDlg, setCloseDlg] = useState(false);
  const [closeVals, setCloseVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [tpl, setTpl] = useState(null);
  const [passScorePct, setPassScorePct] = useState(80);

  const load = useCallback(() => api.get(`/inspections/${id}`).then((r) => {
    setDoc(r.data); setChecklist(r.data.checklist); setDirty(false);
    return api.get('/checklist-templates', { params: { inspectionType: r.data.type, active: true, limit: 1 } })
      .then((t) => setTpl(t.data[0] || null)).catch(() => setTpl(null));
  }).catch((e) => dispatch(notify({ message: e.message, severity: 'error' }))), [id, dispatch]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get('/module-settings/inspect').then((r) => setPassScorePct(r.data.passScorePct || 80)).catch(() => {}); }, []);

  // live weighted compliance, mirroring the server's scoring at close
  const weightOf = tpl ? Object.fromEntries(tpl.items.map((it) => [it.text, { w: it.weight || 1, critical: !!it.critical }])) : {};
  let scoreGot = 0; let scoreMax = 0; let criticalFail = false;
  for (const c of checklist) {
    if (!c.answer || c.answer === 'NA') continue;
    const meta = weightOf[c.text] || { w: 1, critical: false };
    scoreMax += meta.w;
    if (c.answer === 'YES') scoreGot += meta.w; else if (meta.critical) criticalFail = true;
  }
  const livePct = scoreMax > 0 ? Math.round((scoreGot / scoreMax) * 100) : null;
  const suggestedResult = criticalFail ? 'DETAINED' : (livePct !== null && livePct < passScorePct) ? 'DEFICIENCIES' : 'SATISFACTORY';

  if (!doc) return <Skeleton variant="rounded" height={420} />;
  const err = (e) => dispatch(notify({ message: e.message, severity: 'error' }));
  const open = doc.status !== 'CLOSED';
  const canEdit = hasPerm(user, 'inspections.edit') && open;
  const canClose = hasPerm(user, 'inspections.close') && open;

  const loadCodes = () => {
    api.get('/lookups', { params: { category: 'deficiencyCode', limit: 100 } }).then((r) => setDefCodes(r.data));
    api.get('/lookups', { params: { category: 'actionCode', limit: 100 } }).then((r) => setActCodes(r.data));
  };

  const saveChecklist = () => {
    setBusy(true);
    api.put(`/inspections/${id}`, { checklist })
      .then(() => { dispatch(notify('Checklist saved')); load(); }).catch(err).finally(() => setBusy(false));
  };

  const answered = checklist.filter((i) => i.answer).length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Inspections', to: '/inspections' }, { label: doc.number }]}
        title={<>{doc.number} <Typography component="span" sx={{ color: 'text.secondary', fontSize: 16, ml: 1 }}>{doc.vessel?.name}</Typography></>}
        sub={`${doc.type} inspection · ${doc.inspector} · planned ${fmtDT(doc.plannedAt)}`}
        actions={
          <>
            {canEdit && doc.status === 'PLANNED' && (
              <Button variant="outlined" startIcon={<PlayArrowRoundedIcon />} onClick={() => api.post(`/inspections/${id}/start`).then(load).catch(err)}>Start inspection</Button>
            )}
            {canClose && (
              <Button variant="contained" startIcon={<TaskAltRoundedIcon />} onClick={() => { setCloseVals({ remarks: doc.remarks, result: suggestedResult }); setCloseDlg(true); }}>Close inspection</Button>
            )}
          </>
        }
      />
      <Card sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <StatusChip value={doc.status} map={INSPECTION_STATUS_META} size="medium" />
          {doc.result && <StatusChip value={doc.result} map={RESULT_META} size="medium" />}
          {doc.detention && <Chip color="error" label="SHIP DETAINED" size="small" />}
          {doc.portCall && <Chip variant="outlined" size="small" label={`Call ${doc.portCall.vcn}`} sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 11 }} />}
          {(doc.status === 'CLOSED' ? doc.scorePct : livePct) !== null && (doc.status === 'CLOSED' ? doc.scorePct != null : livePct != null) && (
            <Chip
              icon={<ShieldRoundedIcon sx={{ fontSize: 15 }} />}
              label={`${doc.status === 'CLOSED' ? doc.scorePct : livePct}% compliance${doc.status !== 'CLOSED' ? ' (live)' : ''}`}
              size="small"
              color={(doc.status === 'CLOSED' ? doc.scorePct : livePct) >= passScorePct ? 'success' : 'warning'}
              sx={{ fontWeight: 700 }}
            />
          )}
          {criticalFail && doc.status !== 'CLOSED' && <Chip size="small" color="error" label="Critical item failed" />}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {doc.startedAt ? `Started ${fmtDT(doc.startedAt)}` : 'Not started'}{doc.closedAt ? ` · Closed ${fmtDT(doc.closedAt)}` : ''}
          </Typography>
        </Stack>
      </Card>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={7}>
          <Card>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontSize: 15 }}>Checklist <Typography component="span" variant="caption" color="text.secondary">({answered}/{checklist.length} answered)</Typography></Typography>
              {canEdit && dirty && <Button size="small" variant="contained" onClick={saveChecklist} disabled={busy}>Save answers</Button>}
            </Box>
            <Divider />
            <Table size="small">
              <TableBody>
                {checklist.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell sx={{ width: 30, color: 'text.secondary', fontFamily: '"IBM Plex Mono",monospace', fontSize: 11 }}>{item.seq}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 13 }}>{item.text}</Typography>
                      <Typography variant="caption" color="text.secondary">{item.category}</Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ width: 168 }}>
                      <ToggleButtonGroup
                        size="small" exclusive value={item.answer || null}
                        onChange={(_, val) => {
                          if (!canEdit) return;
                          setChecklist((c) => c.map((x, i) => (i === idx ? { ...x, answer: val || '' } : x)));
                          setDirty(true);
                        }}
                        sx={{ '& .MuiToggleButton-root': { px: 1, py: 0.25, fontSize: 11, fontWeight: 700 } }}
                      >
                        <ToggleButton value="YES" color="success">YES</ToggleButton>
                        <ToggleButton value="NO" color="error">NO</ToggleButton>
                        <ToggleButton value="NA">N/A</ToggleButton>
                      </ToggleButtonGroup>
                    </TableCell>
                  </TableRow>
                ))}
                {checklist.length === 0 && <TableRow><TableCell colSpan={3}><Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>No checklist attached</Typography></TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </Grid>

        <Grid item xs={12} lg={5}>
          <Card>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontSize: 15 }}>Findings ({doc.findings.length})</Typography>
              {canEdit && (
                <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => { setFindVals({ status: 'OPEN' }); loadCodes(); setFindDlg({}); }}>Add finding</Button>
              )}
            </Box>
            <Divider />
            <Stack divider={<Divider />}>
              {doc.findings.map((f) => (
                <Box key={f._id} sx={{ p: 2, display: 'flex', gap: 1.5 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip size="small" label={f.deficiencyCode} sx={{ fontFamily: '"IBM Plex Mono",monospace', height: 20, fontSize: 11 }} />
                      {f.actionCode && <Chip size="small" variant="outlined" label={`Action ${f.actionCode}`} sx={{ height: 20, fontSize: 11 }} color={f.actionCode === '30' ? 'error' : 'default'} />}
                      <Chip size="small" label={f.status} color={f.status === 'OPEN' ? 'warning' : 'success'} sx={{ height: 20, fontSize: 10.5 }} />
                    </Stack>
                    <Typography sx={{ fontSize: 13, mt: 0.75 }}>{f.description}</Typography>
                    <Typography variant="caption" color="text.secondary">Due {fmtD(f.dueDate)}{f.closedAt ? ` · closed ${fmtD(f.closedAt)}` : ''}</Typography>
                  </Box>
                  {canEdit && (
                    <Stack spacing={0.5}>
                      <IconButton size="small" onClick={() => {
                        setFindVals({ deficiencyCode: f.deficiencyCode, description: f.description, actionCode: f.actionCode, dueDate: toInputD(f.dueDate), status: f.status });
                        loadCodes(); setFindDlg(f);
                      }}><EditRoundedIcon fontSize="inherit" /></IconButton>
                      <IconButton size="small" color="error" onClick={() => api.delete(`/inspections/${id}/findings/${f._id}`).then(load).catch(err)}><DeleteOutlineRoundedIcon fontSize="inherit" /></IconButton>
                    </Stack>
                  )}
                </Box>
              ))}
              {doc.findings.length === 0 && <Typography color="text.secondary" sx={{ p: 2.5, textAlign: 'center' }} variant="body2">No deficiencies recorded</Typography>}
            </Stack>
          </Card>
          {doc.remarks && (
            <Card sx={{ p: 2, mt: 2 }}>
              <Typography variant="subtitle2" gutterBottom>Remarks</Typography>
              <Typography variant="body2" color="text.secondary">{doc.remarks}</Typography>
            </Card>
          )}
        </Grid>
      </Grid>

      <Dialog open={!!findDlg} onClose={() => !busy && setFindDlg(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{findDlg?._id ? 'Edit finding' : 'Record finding'}</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <FormFields
            fields={[
              { name: 'deficiencyCode', label: 'Deficiency code', type: 'autocomplete', required: true, cols: 12, options: defCodes.map((c) => ({ value: c.code, label: `${c.code} — ${c.label}` })) },
              { name: 'description', label: 'Description', type: 'multiline', required: true, cols: 12 },
              { name: 'actionCode', label: 'Action code', type: 'select', options: actCodes.map((c) => ({ value: c.code, label: `${c.code} — ${c.label}` })) },
              { name: 'dueDate', label: 'Rectify by', type: 'date' },
              { name: 'status', label: 'Status', type: 'select', options: [{ value: 'OPEN', label: 'Open' }, { value: 'CLOSED', label: 'Closed' }] },
            ]}
            values={findVals} onChange={setFindVals}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setFindDlg(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" disabled={busy || !findVals.deficiencyCode || !findVals.description} onClick={() => {
            setBusy(true);
            const req = findDlg?._id
              ? api.put(`/inspections/${id}/findings/${findDlg._id}`, findVals)
              : api.post(`/inspections/${id}/findings`, findVals);
            req.then(() => { dispatch(notify('Finding saved')); setFindDlg(null); load(); }).catch(err).finally(() => setBusy(false));
          }}>Save</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={closeDlg} onClose={() => !busy && setCloseDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Close inspection</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {doc.findings.filter((f) => f.status === 'OPEN').length} open finding(s). Closing as <b>Detained</b> raises a detention notification.
          </Typography>
          {livePct !== null && (
            <Typography variant="caption" sx={{ display: 'block', mb: 2, color: criticalFail ? 'error.main' : 'text.secondary' }}>
              Suggested from the checklist: <b>{RESULT_META[suggestedResult]?.label}</b> ({livePct}% weighted compliance
              {criticalFail ? ', a critical question failed' : `, pass mark ${passScorePct}%`}) — pre-filled below, change if needed.
            </Typography>
          )}
          <FormFields
            fields={[
              { name: 'result', label: 'Result', type: 'select', required: true, cols: 12, options: Object.entries(RESULT_META).map(([value, m]) => ({ value, label: m.label })) },
              { name: 'remarks', label: 'Closing remarks', type: 'multiline', cols: 12 },
            ]}
            values={closeVals} onChange={setCloseVals}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setCloseDlg(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" disabled={busy || !closeVals.result} onClick={() => {
            setBusy(true);
            api.post(`/inspections/${id}/close`, closeVals)
              .then(() => { dispatch(notify('Inspection closed')); setCloseDlg(false); load(); }).catch(err).finally(() => setBusy(false));
          }}>Close inspection</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
