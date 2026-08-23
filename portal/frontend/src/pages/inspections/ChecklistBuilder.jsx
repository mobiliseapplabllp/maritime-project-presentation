import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Skeleton, Stack, Button, TextField, MenuItem, IconButton,
  Chip, Divider, Dialog, DialogTitle, DialogContent, DialogActions, Switch, FormControlLabel,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, ButtonBase, Tooltip,
} from '@mui/material';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ExportMenu from '../../components/common/ExportMenu';

/* Checklist Builder — create checklist types, then add / edit / delete /
 * reorder questions with sections, answer types, weights and critical flags.
 * Saved templates feed every new survey opened in the register. */

const TYPES = ['PSC', 'FSI', 'ISM', 'ISPS', 'MLC', 'HSE', 'TERMINAL'];
const ANSWER_TYPES = [['YES_NO', 'Yes / No'], ['YES_NO_NA', 'Yes / No / N.A.'], ['TEXT', 'Free text'], ['NUMBER', 'Number']];

export default function ChecklistBuilder() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const canManage = hasPerm(user, 'masters.manage') || hasPerm(user, 'inspections.edit');
  const [templates, setTemplates] = useState(null);
  const [selId, setSelId] = useState(null);
  const [draft, setDraft] = useState(null);          // working copy of the selected template
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qDlg, setQDlg] = useState(null);            // null | { index } (edit) | {} (new)
  const [qVals, setQVals] = useState({});
  const [delQ, setDelQ] = useState(null);
  const [delTpl, setDelTpl] = useState(null);

  const err = (e) => dispatch(notify({ message: e.message, severity: 'error' }));
  const load = (keepSel) => api.get('/checklist-templates', { params: { limit: 100, sort: 'name' } }).then((r) => {
    setTemplates(r.data);
    const target = keepSel && r.data.find((t) => t._id === keepSel) ? keepSel : r.data[0]?._id;
    setSelId(target || null);
  }).catch(err);
  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => {
    const t = (templates || []).find((x) => x._id === selId);
    setDraft(t ? JSON.parse(JSON.stringify(t)) : null);
    setDirty(false);
  }, [selId, templates]);

  const sections = useMemo(() => {
    if (!draft) return [];
    const by = new Map();
    (draft.items || []).forEach((it, idx) => {
      if (!by.has(it.category)) by.set(it.category, []);
      by.get(it.category).push({ ...it, idx });
    });
    return [...by.entries()];
  }, [draft]);

  const totalWeight = (draft?.items || []).reduce((s, i) => s + (i.weight || 1), 0);

  const mutate = (fn) => { setDraft((d) => { const n = JSON.parse(JSON.stringify(d)); fn(n); return n; }); setDirty(true); };
  const move = (idx, dir) => mutate((d) => {
    const j = idx + dir;
    if (j < 0 || j >= d.items.length) return;
    [d.items[idx], d.items[j]] = [d.items[j], d.items[idx]];
    d.items.forEach((it, k) => { it.seq = k + 1; });
  });
  const removeQ = (idx) => mutate((d) => { d.items.splice(idx, 1); d.items.forEach((it, k) => { it.seq = k + 1; }); });
  const saveQ = () => {
    if (!qVals.text) return;
    mutate((d) => {
      const item = { text: qVals.text, category: qVals.category || 'General', answerType: qVals.answerType || 'YES_NO_NA',
        weight: Number(qVals.weight) || 1, critical: !!qVals.critical, guidance: qVals.guidance || '' };
      if (qDlg.index !== undefined) d.items[qDlg.index] = { ...d.items[qDlg.index], ...item };
      else d.items.push({ ...item, seq: d.items.length + 1 });
      d.items.forEach((it, k) => { it.seq = k + 1; });
    });
    setQDlg(null);
  };

  const saveTemplate = () => {
    setBusy(true);
    const body = { name: draft.name, inspectionType: draft.inspectionType, description: draft.description,
      items: draft.items, active: draft.active, passScorePct: draft.passScorePct,
      version: dirty && draft._id ? (draft.version || 1) + 1 : draft.version };
    const req = draft._id ? api.put(`/checklist-templates/${draft._id}`, body) : api.post('/checklist-templates', body);
    req.then((r) => { dispatch(notify(`Checklist saved${draft._id ? ` — now v${body.version}` : ''}`)); load(r.data._id || draft._id); })
      .catch(err).finally(() => setBusy(false));
  };

  const newTemplate = () => {
    setTemplates((t) => t); // no-op keep
    setSelId(null);
    setDraft({ name: '', inspectionType: 'HSE', description: '', items: [], active: true, passScorePct: 80, version: 1 });
    setDirty(true);
  };
  const duplicate = () => {
    setSelId(null);
    setDraft((d) => ({ ...JSON.parse(JSON.stringify(d)), _id: undefined, name: `${d.name} (copy)`, version: 1 }));
    setDirty(true);
  };

  if (!templates) return <Skeleton variant="rounded" height={480} />;

  return (
    <>
      <PageHeader
        icon={ChecklistRoundedIcon} iconColor="#9C6412"
        title="Checklist builder" sub="Create checklist types, then add, edit, reorder and weight the questions — new surveys pick these up instantly"
        actions={canManage && (
          <Stack direction="row" spacing={1}>
            {draft && draft.items?.length > 0 && (
              <ExportMenu name={`checklist-${(draft.name || 'new').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} title={draft.name}
                columns={[{ label: '#', value: (r) => r.seq }, { label: 'Section', value: (r) => r.category }, { label: 'Question', value: (r) => r.text },
                  { label: 'Answer', value: (r) => r.answerType }, { label: 'Weight', value: (r) => r.weight }, { label: 'Critical', value: (r) => (r.critical ? 'YES' : '') }]}
                getRows={async () => draft.items} landscape={false} />
            )}
            <Button startIcon={<AddRoundedIcon />} onClick={newTemplate}>New checklist</Button>
            <Button variant="contained" startIcon={<SaveRoundedIcon />} onClick={saveTemplate}
              disabled={!draft || busy || !dirty || !draft.name}>Save{dirty ? ' *' : ''}</Button>
          </Stack>
        )}
      />
      <Grid container spacing={2}>
        <Grid item xs={12} md={3.5}>
          <Stack spacing={1}>
            {templates.map((t) => (
              <ButtonBase key={t._id} onClick={() => setSelId(t._id)} sx={{ textAlign: 'left', borderRadius: 2.5, width: '100%' }}>
                <Card variant="outlined" sx={{ p: 1.5, width: '100%', borderColor: selId === t._id ? '#9C6412' : 'divider', borderWidth: selId === t._id ? 2 : 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography noWrap sx={{ fontWeight: 700, fontSize: 13.5 }}>{t.name}</Typography>
                    <Chip size="small" label={t.inspectionType} sx={{ height: 18, fontSize: 10, fontWeight: 700 }} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {(t.items || []).length} questions · v{t.version || 1} · pass ≥{t.passScorePct || 80}%{t.active === false ? ' · inactive' : ''}
                  </Typography>
                </Card>
              </ButtonBase>
            ))}
            {draft && !draft._id && (
              <Card variant="outlined" sx={{ p: 1.5, borderColor: '#9C6412', borderWidth: 2, borderStyle: 'dashed' }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13.5 }}>{draft.name || 'New checklist (unsaved)'}</Typography>
              </Card>
            )}
          </Stack>
        </Grid>
        <Grid item xs={12} md={8.5}>
          {!draft ? (
            <Card sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">Select a checklist or create a new one.</Typography></Card>
          ) : (
            <Card sx={{ p: 2.5 }}>
              <Grid container spacing={2} sx={{ mb: 1 }}>
                <Grid item xs={12} md={4}>
                  <TextField fullWidth size="small" label="Checklist name" required value={draft.name} disabled={!canManage}
                    onChange={(e) => mutate((d) => { d.name = e.target.value; })} />
                </Grid>
                <Grid item xs={6} md={2.5}>
                  <TextField select fullWidth size="small" label="Type" value={draft.inspectionType} disabled={!canManage}
                    onChange={(e) => mutate((d) => { d.inspectionType = e.target.value; })}>
                    {TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={6} md={2}>
                  <TextField fullWidth size="small" type="number" label="Pass score %" value={draft.passScorePct ?? 80} disabled={!canManage}
                    onChange={(e) => mutate((d) => { d.passScorePct = Number(e.target.value); })} />
                </Grid>
                <Grid item xs={6} md={2} sx={{ display: 'flex', alignItems: 'center' }}>
                  <FormControlLabel control={<Switch checked={draft.active !== false} disabled={!canManage}
                    onChange={(e) => mutate((d) => { d.active = e.target.checked; })} />} label="Active" />
                </Grid>
                <Grid item xs={6} md={1.5} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                  {draft._id && canManage && (
                    <>
                      <Tooltip title="Duplicate as a new checklist"><IconButton onClick={duplicate}><ContentCopyRoundedIcon fontSize="small" /></IconButton></Tooltip>
                      <Tooltip title="Delete checklist"><IconButton color="error" onClick={() => setDelTpl(draft)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton></Tooltip>
                    </>
                  )}
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth size="small" label="Description" value={draft.description || ''} disabled={!canManage}
                    onChange={(e) => mutate((d) => { d.description = e.target.value; })} />
                </Grid>
              </Grid>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                <Chip size="small" label={`${draft.items.length} questions`} sx={{ fontWeight: 700 }} />
                <Chip size="small" variant="outlined" label={`total weight ${totalWeight}`} />
                <Chip size="small" variant="outlined" color="warning" icon={<WarningAmberRoundedIcon sx={{ fontSize: 13 }} />}
                  label={`${draft.items.filter((i) => i.critical).length} critical`} />
                <Box sx={{ flex: 1 }} />
                {canManage && (
                  <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />}
                    onClick={() => { setQVals({ category: sections[sections.length - 1]?.[0] || 'General', answerType: 'YES_NO_NA', weight: 1 }); setQDlg({}); }}>
                    Add question
                  </Button>
                )}
              </Stack>
              {sections.map(([cat, items]) => (
                <Box key={cat} sx={{ mb: 2 }}>
                  <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 10.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.5 }}>
                    {cat} · {items.length}
                  </Typography>
                  <TableContainer sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead><TableRow>
                        <TableCell width={40}>#</TableCell><TableCell>Question</TableCell><TableCell width={110}>Answer</TableCell>
                        <TableCell width={64} align="right">Weight</TableCell><TableCell width={70}>Critical</TableCell>
                        {canManage && <TableCell width={130} align="right">Actions</TableCell>}
                      </TableRow></TableHead>
                      <TableBody>
                        {items.map((it) => (
                          <TableRow key={it.idx} hover>
                            <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12 }}>{it.seq}</TableCell>
                            <TableCell>
                              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{it.text}</Typography>
                              {it.guidance && <Typography variant="caption" color="text.secondary">{it.guidance}</Typography>}
                            </TableCell>
                            <TableCell><Chip size="small" variant="outlined" label={(ANSWER_TYPES.find(([v]) => v === it.answerType) || [])[1] || it.answerType} sx={{ height: 19, fontSize: 10 }} /></TableCell>
                            <TableCell align="right">{it.weight || 1}</TableCell>
                            <TableCell>{it.critical ? <Chip size="small" color="warning" label="Critical" sx={{ height: 19, fontSize: 10 }} /> : '—'}</TableCell>
                            {canManage && (
                              <TableCell align="right">
                                <IconButton size="small" onClick={() => move(it.idx, -1)}><ArrowUpwardRoundedIcon sx={{ fontSize: 15 }} /></IconButton>
                                <IconButton size="small" onClick={() => move(it.idx, 1)}><ArrowDownwardRoundedIcon sx={{ fontSize: 15 }} /></IconButton>
                                <IconButton size="small" onClick={() => { setQVals({ ...it }); setQDlg({ index: it.idx }); }}><EditRoundedIcon sx={{ fontSize: 15 }} /></IconButton>
                                <IconButton size="small" color="error" onClick={() => setDelQ(it)}><DeleteOutlineRoundedIcon sx={{ fontSize: 15 }} /></IconButton>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              ))}
              {draft.items.length === 0 && (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>No questions yet — add the first one.</Typography>
              )}
              <Divider sx={{ my: 1.5 }} />
              <Typography variant="caption" color="text.secondary">
                Saving an edited checklist bumps its version. Surveys already opened keep the version they started with.
              </Typography>
            </Card>
          )}
        </Grid>
      </Grid>

      <Dialog open={!!qDlg} onClose={() => setQDlg(null)} maxWidth="sm" fullWidth>
        <DialogTitle>{qDlg?.index !== undefined ? 'Edit question' : 'Add question'}</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Question text" required multiline minRows={2}
                value={qVals.text || ''} onChange={(e) => setQVals((v) => ({ ...v, text: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Section" value={qVals.category || ''} placeholder="e.g. Fire Safety"
                onChange={(e) => setQVals((v) => ({ ...v, category: e.target.value }))} />
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField select fullWidth size="small" label="Answer type" value={qVals.answerType || 'YES_NO_NA'}
                onChange={(e) => setQVals((v) => ({ ...v, answerType: e.target.value }))}>
                {ANSWER_TYPES.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid item xs={6} sm={3}>
              <TextField fullWidth size="small" type="number" label="Weight" value={qVals.weight ?? 1}
                onChange={(e) => setQVals((v) => ({ ...v, weight: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
              <FormControlLabel control={<Switch checked={!!qVals.critical}
                onChange={(e) => setQVals((v) => ({ ...v, critical: e.target.checked }))} />} label="Critical — a NO fails the checklist" />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Inspector guidance (optional)" value={qVals.guidance || ''}
                onChange={(e) => setQVals((v) => ({ ...v, guidance: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setQDlg(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveQ} disabled={!qVals.text}>{qDlg?.index !== undefined ? 'Save question' : 'Add question'}</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={!!delQ} title="Delete question?" message={`Remove "${delQ?.text?.slice(0, 80)}" from this checklist?`}
        onClose={() => setDelQ(null)} onConfirm={() => { removeQ(delQ.idx); setDelQ(null); }} />
      <ConfirmDialog open={!!delTpl} busy={busy} title="Delete checklist?"
        message={`Delete "${delTpl?.name}"? Surveys that already used it keep their copied questions.`}
        onClose={() => setDelTpl(null)}
        onConfirm={() => {
          setBusy(true);
          api.delete(`/checklist-templates/${delTpl._id}`)
            .then(() => { dispatch(notify('Checklist deleted')); setDelTpl(null); load(); })
            .catch(err).finally(() => setBusy(false));
        }} />
    </>
  );
}
