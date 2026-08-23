import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Chip, Stack, Button, Typography, Box, Divider } from '@mui/material';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import CampaignRoundedIcon from '@mui/icons-material/CampaignRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import CrudPage from '../../components/common/CrudPage';
import FormDrawer from '../../components/common/FormDrawer';
import { fmtD } from '../../utils/format';

const STATUS_META = { IN_FORCE: ['In force', 'success'], DRAFT: ['Draft', 'default'], SUPERSEDED: ['Superseded', 'warning'], WITHDRAWN: ['Withdrawn', 'error'] };

export default function LegislationPage() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [meta, setMeta] = useState({ instrumentTypes: [], instrumentStatus: [] });
  const [reading, setReading] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => { api.get('/meta').then((r) => setMeta(r.data)).catch(() => {}); }, []);

  const uid = String(user?._id);
  const acknowledge = (row, after) => {
    setBusy(true);
    api.post(`/instruments/${row._id}/acknowledge`)
      .then((r) => { dispatch(notify('Acknowledged')); after?.(r.data); setRefresh((x) => x + 1); })
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <CrudPage
        key={refresh}
        statsScope="legislation" icon={CampaignRoundedIcon} iconColor="#8A5A2B" title="Notices & circulars" sub="Acts, rules, notices and circulars — with organisation-wide acknowledgments"
        entityName="instrument" endpoint="/instruments"
        perms={{ create: 'legislation.manage', edit: 'legislation.manage', del: 'legislation.manage' }}
        defaultSort="-issuedDate" searchPlaceholder="Search ref no, title…" drawerWidth="75vw"
        onRowClick={(r) => setReading(r)}
        columns={[
          { key: 'refNo', label: 'Reference', mono: true, render: (r) => <b>{r.refNo}</b> },
          { key: 'title', label: 'Title' },
          { key: 'type', label: 'Type', render: (r) => <Chip size="small" variant="outlined" label={r.type} sx={{ height: 20, fontSize: 10.5 }} /> },
          { key: 'category', label: 'Category' },
          { key: 'issuedDate', label: 'Issued', render: (r) => fmtD(r.issuedDate) },
          { key: 'status', label: 'Status', render: (r) => { const [l, c] = STATUS_META[r.status] || [r.status, 'default']; return <Chip size="small" label={l} color={c} sx={{ height: 21, fontSize: 11 }} variant={c === 'default' ? 'outlined' : 'filled'} />; } },
          { key: 'ack', label: 'Acknowledgment', render: (r) => {
            if (!r.ackRequired) return '—';
            const done = (r.acknowledgedBy || []).some((a) => a.userId === uid);
            return done
              ? <Chip size="small" icon={<TaskAltRoundedIcon sx={{ fontSize: 14 }} />} label="Acknowledged" color="success" variant="outlined" sx={{ height: 21, fontSize: 10.5 }} />
              : <Chip size="small" label="Action required" color="warning" sx={{ height: 21, fontSize: 10.5 }} />;
          } },
        ]}
        filters={[
          { name: 'type', label: 'Type', options: (meta.instrumentTypes || []).map((t) => ({ value: t, label: t })) },
          { name: 'status', label: 'Status', options: Object.entries(STATUS_META).map(([value, [label]]) => ({ value, label })) },
        ]}
        formFields={[
          { name: 'refNo', label: 'Reference number', required: true },
          { name: 'type', label: 'Type', type: 'select', required: true, options: (meta.instrumentTypes || []).map((t) => ({ value: t, label: t })) },
          { name: 'title', label: 'Title', required: true, cols: 12 },
          { name: 'category', label: 'Category' }, { name: 'issuedBy', label: 'Issued by' },
          { name: 'issuedDate', label: 'Issued date', type: 'date' }, { name: 'effectiveDate', label: 'Effective date', type: 'date' },
          { name: 'status', label: 'Status', type: 'select', options: Object.entries(STATUS_META).map(([value, [label]]) => ({ value, label })) },
          { name: 'ackRequired', label: 'Acknowledgment required', type: 'switch' },
          { name: 'summary', label: 'Summary', type: 'multiline', cols: 12 },
          { name: 'body', label: 'Full text', type: 'multiline', rows: 8, cols: 12 },
          { name: 'supersedes', label: 'Supersedes (ref no)' },
        ]}
        defaults={{ status: 'IN_FORCE', issuedBy: 'Harbour Master, Mundra' }}
        toForm={(row) => ({ ...row, issuedDate: row.issuedDate?.slice(0, 10) || '', effectiveDate: row.effectiveDate?.slice(0, 10) || '' })}
      />
      <FormDrawer open={!!reading} title={reading?.refNo} subtitle={reading?.title} onClose={() => setReading(null)} width="75vw">
        {reading && (
          <Box>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
              <Chip size="small" label={reading.type} variant="outlined" />
              <Chip size="small" label={reading.category} variant="outlined" />
              <Chip size="small" label={`Issued ${fmtD(reading.issuedDate)} by ${reading.issuedBy}`} variant="outlined" />
              {reading.supersedes && <Chip size="small" color="warning" variant="outlined" label={`Supersedes ${reading.supersedes}`} />}
            </Stack>
            <Typography sx={{ fontWeight: 600, mb: 1.5 }}>{reading.summary}</Typography>
            <Divider sx={{ mb: 2 }} />
            <Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, fontSize: 14.5 }}>
              {reading.body || 'Full text held in the document repository.'}
            </Typography>
            {reading.ackRequired && (
              <Box sx={{ mt: 3, p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
                <Typography variant="subtitle2" gutterBottom>Acknowledgment</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  {(reading.acknowledgedBy || []).length} user(s) have acknowledged this instrument.
                </Typography>
                {(reading.acknowledgedBy || []).some((a) => a.userId === uid)
                  ? <Chip icon={<TaskAltRoundedIcon />} label="You have acknowledged this" color="success" />
                  : <Button variant="contained" disabled={busy} onClick={() => acknowledge(reading, setReading)}>Acknowledge receipt</Button>}
              </Box>
            )}
          </Box>
        )}
      </FormDrawer>
    </>
  );
}
