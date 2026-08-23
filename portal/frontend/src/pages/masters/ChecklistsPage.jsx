import { Box, TextField, IconButton, Button, Stack, Typography } from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import CrudPage from '../../components/common/CrudPage';

const TYPES = ['PSC', 'FSI', 'ISM', 'ISPS', 'MLC'].map((t) => ({ value: t, label: t }));

export default function ChecklistsPage() {
  return (
    <CrudPage
      title="Checklist templates" sub="Item sets copied into new inspections"
      entityName="template" endpoint="/checklist-templates" permBase="masters" defaultSort="name"
      drawerWidth={520}
      columns={[
        { key: 'name', label: 'Template', render: (r) => <b>{r.name}</b> },
        { key: 'inspectionType', label: 'Type' },
        { key: 'items', label: 'Items', align: 'right', render: (r) => r.items.length },
        { key: 'active', label: 'Active', render: (r) => (r.active ? 'Yes' : 'No') },
      ]}
      formFields={[
        { name: 'name', label: 'Template name', required: true, cols: 12 },
        { name: 'inspectionType', label: 'Inspection type', type: 'select', required: true, options: TYPES },
        { name: 'active', label: 'Active', type: 'switch' },
      ]}
      defaults={{ active: true, items: [] }}
      toForm={(row) => ({ name: row.name, inspectionType: row.inspectionType, active: row.active, items: row.items })}
      transformOut={(v) => ({ name: v.name, inspectionType: v.inspectionType, active: v.active, items: (v.items || []).filter((i) => i.text) })}
      drawerExtra={(_editing, values, setValues) => {
        const items = values.items || [];
        const setItems = (next) => setValues({ ...values, items: next });
        return (
          <Box sx={{ mt: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">Checklist items ({items.length})</Typography>
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setItems([...items, { text: '', category: 'General' }])}>Add item</Button>
            </Stack>
            <Stack spacing={1}>
              {items.map((item, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 11, width: 20, color: 'text.secondary' }}>{i + 1}</Typography>
                  <TextField size="small" fullWidth value={item.text} placeholder="Item text"
                    onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                  <TextField size="small" value={item.category || ''} placeholder="Category" sx={{ width: 140 }}
                    onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} />
                  <IconButton size="small" color="error" onClick={() => setItems(items.filter((_, j) => j !== i))}><DeleteOutlineRoundedIcon fontSize="inherit" /></IconButton>
                </Stack>
              ))}
            </Stack>
          </Box>
        );
      }}
    />
  );
}
