import { useEffect, useState } from 'react';
import { Tabs, Tab, Box, Chip } from '@mui/material';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import api from '../../api/client';
import CrudPage from '../../components/common/CrudPage';

export default function LookupsPage() {
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState('vesselType');

  useEffect(() => { api.get('/meta').then((r) => setCats(r.data.lookupCategories)).catch(() => {}); }, []);

  return (
    <>
      <Tabs value={cat} onChange={(_, c) => setCat(c)} sx={{ mb: 2 }} variant="scrollable" allowScrollButtonsMobile>
        {cats.map((c) => <Tab key={c.key} value={c.key} label={c.label} />)}
      </Tabs>
      <Box key={cat}>
        <CrudPage
          title={cats.find((c) => c.key === cat)?.label || 'Lookups'}
          sub="Reference data used across forms, checks and billing"
          entityName="entry" endpoint="/lookups" permBase="masters" defaultSort="code"
          staticParams={{ category: cat }}
          searchPlaceholder="Search code or label…"
          columns={[
            { key: 'code', label: 'Code', mono: true, sortable: true },
            { key: 'label', label: 'Label' },
            { key: 'meta', label: 'Attributes', render: (r) => {
              const m = r.meta || {};
              const entries = Object.entries(m).slice(0, 3);
              return entries.length
                ? entries.map(([k, v]) => <Chip key={k} size="small" variant="outlined" label={`${k}: ${v}`} sx={{ mr: 0.5, height: 20, fontSize: 10.5 }} />)
                : '—';
            } },
            { key: 'active', label: 'Active', render: (r) => (r.active ? 'Yes' : 'No') },
          ]}
          formFields={[
            { name: 'code', label: 'Code', required: true }, { name: 'label', label: 'Label', required: true },
            { name: 'metaJson', label: 'Attributes (JSON)', type: 'multiline', cols: 12, rows: 3, helper: 'e.g. {"group":"dryBulk","unit":"MT","mtFactor":1}' },
            { name: 'active', label: 'Active', type: 'switch' },
          ]}
          defaults={{ active: true, metaJson: '{}' }}
          toForm={(row) => ({ code: row.code, label: row.label, metaJson: JSON.stringify(row.meta || {}), active: row.active })}
          transformOut={(v) => {
            let meta = {};
            try { meta = JSON.parse(v.metaJson || '{}'); } catch { meta = {}; }
            return { category: cat, code: v.code, label: v.label, meta, active: v.active };
          }}
        />
      </Box>
    </>
  );
}
