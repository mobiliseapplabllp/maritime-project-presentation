import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Box, Card, Chip, Typography, Stack, Button, Drawer, IconButton, Divider,
  TextField, MenuItem, Alert,
} from '@mui/material';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import api from '../../api/client';
import PageHeader from '../../components/common/PageHeader';
import DataTable from '../../components/common/DataTable';
import { hasPerm } from '../../utils/perms';
import { fmtDT } from '../../utils/format';
import { DecisionCard } from './AgentOperations';

/* A3 — the AI decision register.
 *
 * Append-only by construction: an override is a new record that supersedes the
 * original, never an edit. That is what lets the authority answer "why did the
 * platform do that?" months later with the decision exactly as it was made. */

const DISP = {
  AUTO_APPLIED: ['Applied automatically', 'success'],
  ESCALATED: ['Escalated', 'warning'],
  AWAITING_REVIEW: ['Awaiting review', 'default'],
  APPROVED_BY_HUMAN: ['Approved', 'info'],
  OVERRIDDEN: ['Overturned', 'error'],
  REJECTED_BY_HUMAN: ['Rejected', 'error'],
};

export default function DecisionRegister() {
  const user = useSelector((s) => s.auth.user);
  const canReview = hasPerm(user, 'agents.review');

  const [state, setState] = useState({ rows: [], total: 0, page: 1, limit: 20, loading: true });
  const [filters, setFilters] = useState({ agentId: '', disposition: '' });
  const [agents, setAgents] = useState([]);
  const [open, setOpen] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api.get('/agents').then((r) => setAgents(r.data)).catch(() => {}); }, []);

  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    const params = { page: state.page, limit: state.limit, sort: '-at' };
    if (filters.agentId) params.agentId = filters.agentId;
    if (filters.disposition) params.disposition = filters.disposition;
    return api.get('/agents/decisions', { params })
      .then((r) => setState((s) => ({ ...s, rows: r.data, total: r.meta?.total ?? r.data.length, loading: false })))
      .catch((e) => { setErr(e.message); setState((s) => ({ ...s, loading: false })); });
  }, [state.page, state.limit, filters]);
  useEffect(() => { load(); }, [load]);

  const review = (decision) => {
    if (!reason) { setErr('A review decision needs a reason on the record.'); return; }
    setBusy(true); setErr('');
    api.post(`/agents/decisions/${open._id}/review`, { decision, reason })
      .then(() => { setOpen(null); setReason(''); return load(); })
      .catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };

  const pending = (d) => ['AWAITING_REVIEW', 'ESCALATED'].includes(d.disposition);

  return (
    <>
      <PageHeader
        icon={FactCheckRoundedIcon} iconColor="#0E7C86"
        title="AI decision register"
        sub="Every decision an agent has taken — what it was given, what it produced, why, and who reviewed it. Append-only: an override supersedes, it never rewrites."
      />

      {err && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setErr('')}>{err}</Alert>}

      <DataTable
        loading={state.loading}
        rows={state.rows} total={state.total} page={state.page} limit={state.limit}
        onPage={(page) => setState((s) => ({ ...s, page }))}
        onLimit={(limit) => setState((s) => ({ ...s, limit, page: 1 }))}
        onRowClick={(row) => { setOpen(row); setReason(''); setErr(''); }}
        emptyMessage="No decisions on record"
        toolbar={(
          <>
            <TextField
              select size="small" label="Agent" sx={{ width: 200 }} value={filters.agentId}
              onChange={(e) => { setFilters((f) => ({ ...f, agentId: e.target.value })); setState((s) => ({ ...s, page: 1 })); }}
            >
              <MenuItem value="">All agents</MenuItem>
              {agents.map((a) => <MenuItem key={a.agentId} value={a.agentId}>{a.name}</MenuItem>)}
            </TextField>
            <TextField
              select size="small" label="Outcome" sx={{ width: 200 }} value={filters.disposition}
              onChange={(e) => { setFilters((f) => ({ ...f, disposition: e.target.value })); setState((s) => ({ ...s, page: 1 })); }}
            >
              <MenuItem value="">Any outcome</MenuItem>
              {Object.entries(DISP).map(([k, [l]]) => <MenuItem key={k} value={k}>{l}</MenuItem>)}
            </TextField>
          </>
        )}
        columns={[
          { key: 'at', label: 'When', render: (r) => fmtDT(r.at), mono: true, width: 150 },
          { key: 'agentName', label: 'Agent', render: (r) => r.agentName || r.agentId },
          { key: 'action', label: 'Decision', render: (r) => <b>{r.action}</b> },
          { key: 'subjectLabel', label: 'Subject', render: (r) => r.subjectLabel || r.subjectType || '—' },
          {
            key: 'confidence', label: 'Confidence', align: 'right', mono: true,
            render: (r) => (r.confidence != null ? r.confidence.toFixed(2) : '—'),
          },
          {
            key: 'disposition',
            label: 'Outcome',
            render: (r) => {
              const [l, c] = DISP[r.disposition] || [r.disposition, 'default'];
              return <Chip size="small" color={c} label={l} sx={{ height: 20, fontSize: 10.5 }} variant={c === 'default' ? 'outlined' : 'filled'} />;
            },
          },
        ]}
      />

      <Drawer anchor="right" open={!!open} onClose={() => setOpen(null)}
        PaperProps={{ sx: { width: { xs: '100%', md: '54vw' }, p: 2.5, display: 'block', overflowY: 'auto' } }}>
        {open && (
          <>
            <Stack direction="row" alignItems="flex-start" sx={{ mb: 1.5 }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 18 }}>{open.action}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {open.agentName || open.agentId} · {fmtDT(open.at)}
                </Typography>
              </Box>
              <IconButton onClick={() => setOpen(null)}><CloseRoundedIcon /></IconButton>
            </Stack>

            <DecisionCard d={open} />

            {(open.inputs || open.output) && (
              <Card variant="outlined" sx={{ p: 1.75, mt: 1.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 1 }}>What it was given, and what it produced</Typography>
                <Box component="pre" sx={{
                  m: 0, fontSize: 11, fontFamily: '"IBM Plex Mono",monospace', whiteSpace: 'pre-wrap',
                  color: 'text.secondary', maxHeight: 260, overflow: 'auto',
                }}>
                  {JSON.stringify({ inputs: open.inputs, output: open.output }, null, 2)}
                </Box>
              </Card>
            )}

            {open.escalationReason && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>Escalated — {open.escalationReason}</Alert>
            )}

            {canReview && pending(open) && (
              <Card variant="outlined" sx={{ p: 1.75, mt: 1.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 1 }}>Review</Typography>
                <TextField
                  size="small" fullWidth label="Reason — recorded against the decision"
                  value={reason} onChange={(e) => setReason(e.target.value)}
                />
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <Button variant="contained" size="small" disabled={busy} onClick={() => review('APPROVE')}>Approve</Button>
                  <Button variant="outlined" size="small" color="error" disabled={busy} onClick={() => review('OVERRIDE')}>Overturn</Button>
                </Stack>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 1 }}>
                  Overturning writes a superseding record. The original stays exactly as the agent made it.
                </Typography>
              </Card>
            )}
            {!canReview && pending(open) && (
              <Alert severity="info" sx={{ mt: 1.5 }}>Reviewing decisions needs the agents.review permission.</Alert>
            )}
          </>
        )}
      </Drawer>
    </>
  );
}
