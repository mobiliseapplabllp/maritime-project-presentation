import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { IconButton, Tooltip, Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Chip } from '@mui/material';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import CrudPage from '../../components/common/CrudPage';
import EntityHover from '../../components/common/EntityHover';
import { fmtDT } from '../../utils/format';

export default function UsersPage() {
  const dispatch = useDispatch();
  const [roles, setRoles] = useState([]);
  const [resetFor, setResetFor] = useState(null);
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/roles').then((r) => setRoles(r.data)).catch(() => {}); }, []);
  const roleOpts = roles.map((r) => ({ value: r._id, label: r.name }));

  return (
    <>
      <CrudPage
        statsScope="users" icon={GroupRoundedIcon} iconColor="#0A2239" title="Users" sub="Portal accounts and their roles"
        entityName="user" endpoint="/users" defaultSort="name"
        perms={{ create: 'users.manage', edit: 'users.manage', del: 'users.manage' }}
        searchPlaceholder="Search name, email…"
        columns={[
          { key: 'name', label: 'Name', render: (r) => <EntityHover type="user" id={r._id}><b>{r.name}</b></EntityHover> },
          { key: 'email', label: 'Email', mono: true },
          { key: 'role', label: 'Role', render: (r) => <Chip size="small" variant="outlined" label={r.role?.name || '—'} sx={{ height: 20, fontSize: 11 }} /> },
          { key: 'designation', label: 'Designation' },
          { key: 'department', label: 'Department', render: (r) => r.department || '—' },
          { key: 'active', label: 'Status', render: (r) => <Chip size="small" label={r.active ? 'Active' : 'Disabled'} color={r.active ? 'success' : 'default'} sx={{ height: 20, fontSize: 11 }} /> },
          { key: 'lastLoginAt', label: 'Last login', render: (r) => fmtDT(r.lastLoginAt) },
        ]}
        filters={[{ name: 'role', label: 'Role', options: roleOpts }]}
        formFields={(editing) => [
          { name: 'name', label: 'Full name', required: true }, { name: 'email', label: 'Email', required: true },
          ...(!editing?._id ? [{ name: 'password', label: 'Initial password', required: true, helper: 'Min 8 characters' }] : []),
          { name: 'role', label: 'Role', type: 'select', required: true, options: roleOpts },
          { name: 'designation', label: 'Designation' }, { name: 'department', label: 'Department' }, { name: 'phone', label: 'Phone' },
          { name: 'active', label: 'Account active', type: 'switch' },
        ]}
        defaults={{ active: true }}
        toForm={(row) => ({ name: row.name, email: row.email, role: row.role?._id || row.role, designation: row.designation, phone: row.phone, active: row.active })}
        rowActionsExtra={(row) => (
          <Tooltip title="Reset password">
            <IconButton size="small" onClick={() => { setResetFor(row); setPwd(''); }}><KeyRoundedIcon fontSize="inherit" /></IconButton>
          </Tooltip>
        )}
        deleteMessage={(r) => `Delete ${r?.name}? Their audit history is retained.`}
      />
      <Dialog open={!!resetFor} onClose={() => !busy && setResetFor(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset password — {resetFor?.name}</DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          <TextField autoFocus fullWidth label="New password" value={pwd} onChange={(e) => setPwd(e.target.value)} helperText="Min 8 characters — share it with the user securely" />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setResetFor(null)} disabled={busy}>Cancel</Button>
          <Button variant="contained" disabled={busy || pwd.length < 8} onClick={() => {
            setBusy(true);
            api.post(`/users/${resetFor._id}/reset-password`, { password: pwd })
              .then(() => { dispatch(notify('Password reset')); setResetFor(null); })
              .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
              .finally(() => setBusy(false));
          }}>Reset</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
