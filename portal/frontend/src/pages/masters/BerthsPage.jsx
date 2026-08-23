import CrudPage from '../../components/common/CrudPage';
import StatusChip from '../../components/common/StatusChip';
import { BERTH_STATUS_META } from '../../utils/status';

const TYPES = ['CONTAINER', 'BULK', 'MULTIPURPOSE', 'LIQUID', 'RORO', 'SPM', 'COAL'].map((t) => ({ value: t, label: t }));

export default function BerthsPage() {
  return (
    <CrudPage
      statsScope="masters" title="Berths & terminals" sub="Physical berth inventory — allocation checks run against these limits"
      entityName="berth" endpoint="/berths" permBase="masters" defaultSort="code"
      searchPlaceholder="Search code, name, terminal…"
      columns={[
        { key: 'code', label: 'Code', mono: true, sortable: true },
        { key: 'name', label: 'Name' },
        { key: 'terminal', label: 'Terminal' },
        { key: 'berthType', label: 'Type' },
        { key: 'loaMax', label: 'Max LOA (m)', align: 'right', mono: true },
        { key: 'draftMax', label: 'Max draft (m)', align: 'right', mono: true },
        { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} map={BERTH_STATUS_META} /> },
      ]}
      filters={[{ name: 'berthType', label: 'Type', options: TYPES }, { name: 'status', label: 'Status', options: Object.entries(BERTH_STATUS_META).map(([value, m]) => ({ value, label: m.label })) }]}
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
  );
}
