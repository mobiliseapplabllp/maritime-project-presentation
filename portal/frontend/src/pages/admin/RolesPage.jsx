import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Grid, Card, Box, Typography, List, ListItemButton, ListItemText, Button, Checkbox, Table,
  TableHead, TableRow, TableCell, TableBody, Chip, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, Stack, Skeleton, Divider,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import ConfirmDialog from '../../components/common/ConfirmDialog';

export default function RolesPage() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [roles, setRoles] = useState(null);
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [perms, setPerms] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newVals, setNewVals] = useState({ name: '', description: '' });
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const canManage = hasPerm(user, 'roles.manage');
  const err = (e) => dispatch(notify({ message: e.message, severity: 'error' }));

  const load = useCallback((keepId) => Promise.all([api.get('/roles'), api.get('/meta')]).then(([r, m]) => {
    setRoles(r.data); setGroups(m.data.permissionGroups);
    const pick = r.data.find((x) => x._id === (keepId || selected?._id)) || r.data[0];
    setSelected(pick); setPerms(pick?.permissions || []); setDirty(false);
  }).catch(err), [selected]); // eslint-disable-line
  useEffect(() => { load(); }, []); // eslint-disable-line

  if (!roles) return <Skeleton variant="rounded" height={420} />;
  const isSuper = selected?.permissions.includes('*');
  const editable = canManage && selected && !isSuper;

  const toggle = (p) => {
    if (!editable) return;
    setPerms((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]));
    setDirty(true);
  };
  const toggleModule = (g) => {
    if (!editable) return;
    const all = g.actions.map((a) => `${g.module}.${a}`);
    const has = all.every((p) => perms.includes(p));
    setPerms((x) => (has ? x.filter((p) => !all.includes(p)) : [...new Set([...x, ...all])]));
    setDirty(true);
  };

  return (
    <>
      <PageHeader
        title="Roles & permissions" sub="What each role can see and do — changes apply on the user's next request"
        actions={canManage && <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => { setNewVals({ name: '', description: '' }); setCreating(true); }}>New role</Button>}
      />
      <Grid container spacing={2}>
        <Grid item xs={12} md={3.5}>
          <Card>
            <List dense disablePadding>
              {roles.map((r) => (
                <ListItemButton key={r._id} selected={selected?._id === r._id}
                  onClick={() => { setSelected(r); setPerms(r.permissions); setDirty(false); }}>
                  <ListItemText
                    primary={<Stack direction="row" spacing={1} alignItems="center">
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      {r.system && <Chip size="small" variant="outlined" label="system" sx={{ height: 18, fontSize: 10 }} />}
                    </Stack>}
                    secondary={`${r.userCount} user(s) · ${r.permissions.includes('*') ? 'all permissions' : `${r.permissions.length} permissions`}`}
                  />
                  {canManage && !r.system && (
                    <DeleteOutlineRoundedIcon fontSize="small" color="error" onClick={(e) => { e.stopPropagation(); setDeleting(r); }} />
                  )}
                </ListItemButton>
              ))}
            </List>
          </Card>
        </Grid>
        <Grid item xs={12} md={8.5}>
          <Card>
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography variant="h6" sx={{ fontSize: 15 }}>{selected?.name}</Typography>
                <Typography variant="caption" color="text.secondary">{selected?.description}</Typography>
              </Box>
              {isSuper && <Chip color="primary" size="small" label="Full access — not editable" />}
              {editable && dirty && (
                <Button variant="contained" size="small" disabled={busy} onClick={() => {
                  setBusy(true);
                  api.put(`/roles/${selected._id}`, { permissions: perms })
                    .then(() => { dispatch(notify('Permissions saved')); load(selected._id); })
                    .catch(err).finally(() => setBusy(false));
                }}>Save changes</Button>
              )}
            </Box>
            <Divider />
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Module</TableCell>
                  {['view', 'create', 'edit', 'delete', 'manage', 'transition', 'close', 'issue', 'pay'].map((a) => (
                    <TableCell key={a} align="center" sx={{ px: 0.5 }}>{a}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.map((g) => {
                  const cols = ['view', 'create', 'edit', 'delete', 'manage', 'transition', 'close', 'issue', 'pay'];
                  const all = g.actions.map((a) => `${g.module}.${a}`);
                  const allOn = isSuper || all.every((p) => perms.includes(p));
                  return (
                    <TableRow key={g.module} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Checkbox size="small" checked={allOn} disabled={!editable}
                          indeterminate={!allOn && !isSuper && all.some((p) => perms.includes(p))}
                          onChange={() => toggleModule(g)} sx={{ p: 0.25, mr: 0.75 }} />
                        <b>{g.label}</b>
                      </TableCell>
                      {cols.map((a) => (
                        <TableCell key={a} align="center" sx={{ px: 0.5 }}>
                          {g.actions.includes(a) ? (
                            <Checkbox size="small" sx={{ p: 0.25 }} disabled={!editable}
                              checked={isSuper || perms.includes(`${g.module}.${a}`)}
                              onChange={() => toggle(`${g.module}.${a}`)} />
                          ) : <Typography component="span" sx={{ color: 'divider' }}>·</Typography>}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={creating} onClose={() => !busy && setCreating(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New role</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <Stack spacing={2}>
            <TextField autoFocus label="Role name" value={newVals.name} onChange={(e) => setNewVals((v) => ({ ...v, name: e.target.value }))} />
            <TextField label="Description" value={newVals.description} onChange={(e) => setNewVals((v) => ({ ...v, description: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setCreating(false)} disabled={busy}>Cancel</Button>
          <Button variant="contained" disabled={busy || !newVals.name} onClick={() => {
            setBusy(true);
            api.post('/roles', { ...newVals, permissions: ['dashboard.view'] })
              .then((r) => { dispatch(notify('Role created — now set its permissions')); setCreating(false); load(r.data._id); })
              .catch(err).finally(() => setBusy(false));
          }}>Create</Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={!!deleting} busy={busy} title={`Delete role "${deleting?.name}"?`}
        message="Roles still assigned to users cannot be deleted."
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          setBusy(true);
          api.delete(`/roles/${deleting._id}`)
            .then(() => { dispatch(notify('Role deleted')); setDeleting(null); load(); })
            .catch(err).finally(() => setBusy(false));
        }}
      />
    </>
  );
}
