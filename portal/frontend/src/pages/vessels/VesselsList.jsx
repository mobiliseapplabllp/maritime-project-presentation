import { useNavigate } from 'react-router-dom';
import { Chip } from '@mui/material';
import DirectionsBoatFilledRoundedIcon from '@mui/icons-material/DirectionsBoatFilledRounded';
import CrudPage from '../../components/common/CrudPage';
import StatusChip from '../../components/common/StatusChip';
import EntityHover from '../../components/common/EntityHover';
import { fmtNum } from '../../utils/format';

const TYPES = ['CONT', 'BULK', 'TANK', 'GEN', 'RORO', 'OSV'].map((t) => ({ value: t, label: t }));
const FLAGS = ['India', 'Panama', 'Liberia', 'Marshall Islands', 'Singapore', 'Malta', 'Hong Kong'].map((f) => ({ value: f, label: f }));
const STATUS_META = { ACTIVE: { label: 'Active', color: 'success' }, INACTIVE: { label: 'Inactive', color: 'default' } };

export default function VesselsList() {
  const navigate = useNavigate();
  return (
    <CrudPage
      statsScope="vessels" icon={DirectionsBoatFilledRoundedIcon} iconColor="#3B6FB6" title="Vessel registry" sub="Ships known to the port, with their particulars and certificates"
      entityName="vessel" endpoint="/vessels" permBase="vessels"
      perms={{ create: 'vessels.create', edit: 'vessels.edit', del: 'vessels.delete' }}
      defaultSort="name" searchPlaceholder="Search name, IMO, call sign…"
      onRowClick={(r) => navigate(`/vessels/${r._id}`)}
      columns={[
        { key: 'name', label: 'Vessel', render: (r) => <EntityHover type="vessel" id={r._id}><b>{r.name}</b></EntityHover> },
        { key: 'imo', label: 'IMO', mono: true },
        { key: 'type', label: 'Type', render: (r) => <Chip size="small" variant="outlined" label={r.type} sx={{ height: 20, fontSize: 11 }} /> },
        { key: 'flag', label: 'Flag' },
        { key: 'grt', label: 'GRT', align: 'right', render: (r) => fmtNum(r.grt), mono: true },
        { key: 'loa', label: 'LOA (m)', align: 'right', mono: true },
        { key: 'agent', label: 'Agent', mono: true },
        { key: 'classSociety', label: 'Class' },
        { key: 'status', label: 'Status', render: (r) => <StatusChip value={r.status} map={STATUS_META} /> },
      ]}
      filters={[{ name: 'type', label: 'Type', options: TYPES }, { name: 'flag', label: 'Flag', options: FLAGS }]}
      formFields={[
        { name: 'name', label: 'Vessel name', required: true },
        { name: 'imo', label: 'IMO number', required: true, helper: '7 digits' },
        { name: 'type', label: 'Type', type: 'select', required: true, options: TYPES },
        { name: 'flag', label: 'Flag state', type: 'select', required: true, options: FLAGS },
        { name: 'mmsi', label: 'MMSI' }, { name: 'callSign', label: 'Call sign' },
        { name: 'built', label: 'Year built', type: 'number' }, { name: 'classSociety', label: 'Class society' },
        { name: 'grt', label: 'GRT', type: 'number', required: true }, { name: 'dwt', label: 'DWT', type: 'number' },
        { name: 'loa', label: 'LOA (m)', type: 'number' }, { name: 'beam', label: 'Beam (m)', type: 'number' },
        { name: 'maxDraft', label: 'Max draft (m)', type: 'number' }, { name: 'agent', label: 'Agent code' },
        { name: 'owner', label: 'Registered owner', cols: 12 },
        { name: 'status', label: 'Status', type: 'select', options: [{ value: 'ACTIVE', label: 'Active' }, { value: 'INACTIVE', label: 'Inactive' }] },
      ]}
      defaults={{ status: 'ACTIVE', flag: 'India' }}
      deleteMessage={(r) => `Delete ${r?.name}? Vessels with port-call history cannot be deleted.`}
    />
  );
}
