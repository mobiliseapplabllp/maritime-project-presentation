import { useState } from 'react';
import { Chip, IconButton, Tooltip, Typography } from '@mui/material';
import AnchorRoundedIcon from '@mui/icons-material/AnchorRounded';
import EventBusyRoundedIcon from '@mui/icons-material/EventBusyRounded';
import CrudPage from '../../components/common/CrudPage';
import StatusChip from '../../components/common/StatusChip';
import { BERTH_STATUS_META } from '../../utils/status';
import { fmtD, fmtNum } from '../../utils/format';
import BerthOutageDrawer from './BerthOutageDrawer';
import BerthDowntimePanel from './BerthDowntimePanel';

const TYPES = ['CONTAINER', 'BULK', 'MULTIPURPOSE', 'LIQUID', 'RORO', 'SPM', 'COAL'].map((t) => ({ value: t, label: t }));

const lastOutage = (r) => {
  const outs = r.outages || [];
  if (!outs.length) return null;
  return outs.slice().sort((a, b) => new Date(b.from) - new Date(a.from))[0];
};

export default function BerthsPage() {
  const [outages, setOutages] = useState(null);
  return (
    <>
      <CrudPage
        statsScope="masters" icon={AnchorRoundedIcon} iconColor="#0797A5" title="Berths & terminals"
        sub="Physical berth inventory — allocation checks run against these limits · click a row for its outage history"
        entityName="berth" endpoint="/berths" permBase="masters" defaultSort="code"
        searchPlaceholder="Search code, name, terminal…"
        beforeTable={<BerthDowntimePanel onOpenBerth={(b) => setOutages(b)} />}
        onRowClick={(row) => setOutages(row)}
        columns={[
          { key: 'code', label: 'Code', mono: true, sortable: true },
          { key: 'name', label: 'Name' },
          { key: 'terminal', label: 'Terminal' },
          { key: 'berthType', label: 'Type' },
          { key: 'loaMax', label: 'Max LOA (m)', align: 'right', mono: true },
          { key: 'draftMax', label: 'Max draft (m)', align: 'right', mono: true },
          {
            key: 'outages',
            label: 'Last outage',
            render: (r) => {
              const o = lastOutage(r);
              if (!o) return <Typography variant="caption" color="text.secondary">No history</Typography>;
              return (
                <>
                  <Chip size="small" variant="outlined" label={`${o.kind.toLowerCase()} · ${fmtNum(o.days)} d`} sx={{ height: 20, fontSize: 11, mr: 0.75 }} />
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>{fmtD(o.from)}</Typography>
                </>
              );
            },
          },
          { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} map={BERTH_STATUS_META} /> },
        ]}
        filters={[{ name: 'berthType', label: 'Type', options: TYPES }, { name: 'status', label: 'Status', options: Object.entries(BERTH_STATUS_META).map(([value, m]) => ({ value, label: m.label })) }]}
        rowActionsExtra={(row) => (
          <Tooltip title="Outage history">
            <IconButton size="small" onClick={() => setOutages(row)}><EventBusyRoundedIcon fontSize="inherit" /></IconButton>
          </Tooltip>
        )}
        formFields={[
          { name: 'code', label: 'Berth code', required: true }, { name: 'name', label: 'Name', required: true },
          { name: 'terminal', label: 'Terminal', required: true }, { name: 'berthType', label: 'Type', type: 'select', required: true, options: TYPES },
          { name: 'loaMax', label: 'Max LOA (m)', type: 'number', required: true }, { name: 'draftMax', label: 'Max draft (m)', type: 'number', required: true },
          { name: 'status', label: 'Status', type: 'select', options: Object.entries(BERTH_STATUS_META).map(([value, m]) => ({ value, label: m.label })) },
          { name: 'remarks', label: 'Remarks', type: 'multiline', cols: 12 },
        ]}
        defaults={{ status: 'OPERATIONAL', berthType: 'MULTIPURPOSE' }}
        deleteMessage={(r) => `Delete berth ${r?.code}? Berths with active or planned calls are protected.`}
      />
      <BerthOutageDrawer berth={outages} onClose={() => setOutages(null)} />
    </>
  );
}
