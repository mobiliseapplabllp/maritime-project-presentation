import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button, Box, Stack, TextField, MenuItem, IconButton } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from './PageHeader';
import DataTable from './DataTable';
import FormFields from './FormFields';
import ConfirmDialog from './ConfirmDialog';
import FormDrawer from './FormDrawer';
import PageStats from './PageStats';
import ExportMenu from './ExportMenu';

/**
 * Full server-side CRUD page driven by config.
 * { title, sub, endpoint, columns, formFields (array|fn(editing)), defaults, permBase | perms:{create,edit,del},
 *   filters: [{name,label,options}], transformOut(values), rowActionsExtra(row), onRowClick, searchPlaceholder,
 *   drawerWidth, headerActions, beforeTable (node rendered between the stat cards and the table) }
 */
export default function CrudPage(cfg) {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const perms = cfg.perms || {
    create: `${cfg.permBase}.manage`, edit: `${cfg.permBase}.manage`, del: `${cfg.permBase}.manage`,
  };
  const [state, setState] = useState({ rows: [], total: 0, page: 1, limit: 20, q: '', sort: cfg.defaultSort || '-createdAt', loading: true });
  const [filterVals, setFilterVals] = useState({});
  const [editing, setEditing] = useState(null);       // null | {} (new) | row
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [statsKey, setStatsKey] = useState(0);

  const load = useCallback((over = {}) => {
    const s = { ...state, ...over };
    setState((x) => ({ ...x, ...over, loading: true }));
    const params = { page: s.page, limit: s.limit, q: s.q || undefined, sort: s.sort, ...filterVals, ...(cfg.staticParams || {}) };
    api.get(cfg.endpoint, { params })
      .then((r) => setState((x) => ({ ...x, rows: r.data, total: r.meta?.total ?? r.data.length, loading: false })))
      .catch((e) => { dispatch(notify({ message: e.message, severity: 'error' })); setState((x) => ({ ...x, loading: false })); });
  }, [state.page, state.limit, state.q, state.sort, filterVals]); // eslint-disable-line

  useEffect(() => { load(); }, [state.page, state.limit, state.q, state.sort, filterVals]); // eslint-disable-line

  const fields = useMemo(() => (typeof cfg.formFields === 'function' ? cfg.formFields(editing) : cfg.formFields), [cfg, editing]);

  const openNew = () => { setEditing({}); setValues(cfg.defaults || {}); };
  const openEdit = (row) => {
    setEditing(row);
    const v = {};
    for (const f of (typeof cfg.formFields === 'function' ? cfg.formFields(row) : cfg.formFields)) {
      v[f.name] = cfg.toForm ? cfg.toForm(row)[f.name] : row[f.name];
      if (v[f.name] === undefined) v[f.name] = f.type === 'switch' ? false : '';
    }
    setValues(v);
  };

  const save = () => {
    setBusy(true);
    const body = cfg.transformOut ? cfg.transformOut(values, editing) : values;
    const req = editing?._id ? api.put(`${cfg.endpoint}/${editing._id}`, body) : api.post(cfg.endpoint, body);
    req.then(() => {
      dispatch(notify(editing?._id ? `${cfg.entityName || 'Record'} updated` : `${cfg.entityName || 'Record'} created`));
      setEditing(null); load(); setStatsKey((k) => k + 1);
    }).catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
      .finally(() => setBusy(false));
  };

  const doDelete = () => {
    setBusy(true);
    api.delete(`${cfg.endpoint}/${deleting._id}`)
      .then(() => { dispatch(notify(`${cfg.entityName || 'Record'} deleted`)); setDeleting(null); load(); setStatsKey((k) => k + 1); })
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
      .finally(() => setBusy(false));
  };

  const columns = [...cfg.columns];
  if (hasPerm(user, perms.edit) || hasPerm(user, perms.del) || cfg.rowActionsExtra) {
    columns.push({
      key: '__actions', label: '', align: 'right', width: 110,
      render: (row) => (
        <Stack direction="row" spacing={0.5} justifyContent="flex-end" onClick={(e) => e.stopPropagation()}>
          {cfg.rowActionsExtra && cfg.rowActionsExtra(row, load)}
          {hasPerm(user, perms.edit) && (
            <IconButton size="small" onClick={() => openEdit(row)}><EditRoundedIcon fontSize="inherit" /></IconButton>
          )}
          {hasPerm(user, perms.del) && (
            <IconButton size="small" color="error" onClick={() => setDeleting(row)}><DeleteOutlineRoundedIcon fontSize="inherit" /></IconButton>
          )}
        </Stack>
      ),
    });
  }

  return (
    <>
      <PageHeader
        title={cfg.title} sub={cfg.sub} icon={cfg.icon} iconColor={cfg.iconColor}
        actions={
          <>
            {cfg.exportName && (
              <ExportMenu
                name={cfg.exportName} title={cfg.title}
                columns={cfg.exportColumns || cfg.columns.filter((c) => c.key !== '__actions').map((c) => ({
                  label: c.label || c.key,
                  value: c.exportValue || ((r) => { const v = r[c.key]; return v && typeof v === 'object' ? (v.name || v.code || '') : (v ?? ''); }),
                }))}
                getRows={() => api.get(cfg.endpoint, { params: { limit: 1000, sort: state.sort, q: state.q || undefined, ...filterVals, ...(cfg.staticParams || {}) } }).then((r) => r.data)}
              />
            )}
            {cfg.headerActions}
            {hasPerm(user, perms.create) && (
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openNew}>
                {cfg.addLabel || `Add ${cfg.entityName || ''}`}
              </Button>
            )}
          </>
        }
      />
      {cfg.statsScope && <PageStats scope={cfg.statsScope} refreshKey={statsKey} />}
      {cfg.beforeTable}
      <DataTable
        columns={columns} rows={state.rows} total={state.total}
        page={state.page} limit={state.limit} loading={state.loading}
        onPage={(page) => setState((x) => ({ ...x, page }))}
        onLimit={(limit) => setState((x) => ({ ...x, limit, page: 1 }))}
        search={state.q} onSearch={(q) => setState((x) => ({ ...x, q, page: 1 }))}
        searchPlaceholder={cfg.searchPlaceholder}
        sort={state.sort} onSort={(sort) => setState((x) => ({ ...x, sort }))}
        onRowClick={cfg.onRowClick}
        toolbar={(cfg.filters || []).map((f) => (
          <TextField key={f.name} select size="small" label={f.label} sx={{ minWidth: 150 }}
            value={filterVals[f.name] ?? ''}
            onChange={(e) => { setFilterVals((v) => ({ ...v, [f.name]: e.target.value })); setState((x) => ({ ...x, page: 1 })); }}>
            <MenuItem value="">All</MenuItem>
            {f.options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
          </TextField>
        ))}
      />
      <FormDrawer
        open={!!editing} busy={busy} width={cfg.drawerWidth || '75vw'}
        title={editing?._id ? `Edit ${cfg.entityName || ''}` : `New ${cfg.entityName || ''}`}
        subtitle={cfg.sub}
        onClose={() => setEditing(null)} onSubmit={save}
        submitLabel={editing?._id ? 'Save changes' : 'Create'}
      >
        {editing && <FormFields fields={fields} values={values} onChange={setValues} />}
        {cfg.drawerExtra && editing && cfg.drawerExtra(editing, values, setValues)}
      </FormDrawer>
      <ConfirmDialog
        open={!!deleting} busy={busy}
        title={`Delete ${cfg.entityName || 'record'}?`}
        message={cfg.deleteMessage ? cfg.deleteMessage(deleting) : 'This cannot be undone.'}
        onClose={() => setDeleting(null)} onConfirm={doDelete}
      />
    </>
  );
}
