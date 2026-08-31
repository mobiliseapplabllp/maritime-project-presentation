import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Box, Card, Chip, Typography, Stack, Button, Drawer, IconButton, Divider,
  TextField, MenuItem, Slider, Alert, Skeleton, LinearProgress, Tooltip,
} from '@mui/material';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import api from '../../api/client';
import PageHeader from '../../components/common/PageHeader';
import PageStats from '../../components/common/PageStats';
import { hasPerm } from '../../utils/perms';
import { fmtDT } from '../../utils/format';

/* A3 — the agent console.
 *
 * The governance the RFP asks for is not a claim that the AI is careful. It is
 * that the authority can see what every agent decided, change how much latitude
 * each one has without calling the vendor, overturn any decision, and suspend a
 * misbehaving agent. This screen is where those four things happen; the register
 * behind it is append-only, so nothing here can quietly rewrite history. */

const LEVELS = ['SUPERVISED', 'ASSISTED', 'AUTONOMOUS'];
// the seven mandated agents run over live records on demand; the analytics
// workforce runs on its own schedule in the companion portal
const RUNNABLE = (id) => /^a\d_/.test(id);
const LEVEL_META = {
  SUPERVISED: ['Supervised', 'default', 'Every recommendation is reviewed before it takes effect'],
  ASSISTED: ['Assisted', 'info', 'Acts alone above the confidence threshold, escalates below it'],
  AUTONOMOUS: ['Autonomous', 'success', 'Acts and notifies, within the approved guardrails'],
};

export default function AgentOperations() {
  const user = useSelector((s) => s.auth.user);
  const canConfigure = hasPerm(user, 'agents.configure');

  const [dash, setDash] = useState(null);
  const [agents, setAgents] = useState(null);
  const [open, setOpen] = useState(null);      // selected agent (detail)
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(() => Promise.all([
    api.get('/agents/dashboard'), api.get('/agents'),
  ]).then(([d, a]) => { setDash(d.data); setAgents(a.data); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const openAgent = (a) => api.get(`/agents/${a.agentId}`).then((r) => {
    setOpen(r.data);
    setForm({
      autonomyLevel: r.data.autonomyLevel,
      confidenceThreshold: r.data.confidenceThreshold,
      enabled: r.data.enabled,
      reason: '',
    });
    setErr(''); setNote('');
  }).catch((e) => setErr(e.message));

  const save = () => {
    setBusy(true); setErr('');
    api.put(`/agents/${open.agentId}`, form)
      .then(() => { setNote('Configuration saved — the change is on the agent’s record.'); return load(); })
      .then(() => openAgent(open))
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  };

  const runNow = () => {
    setBusy(true); setErr(''); setNote('');
    api.post(`/agents/${open.agentId}/run`, {})
      .then((r) => {
        const d = r.data;
        const by = Object.entries(d.byDisposition || {})
          .map(([k, v]) => `${v} ${k.toLowerCase().replace(/_/g, ' ')}`).join(', ');
        setNote(`${d.ran} ran over live records — ${d.recorded} decision(s) recorded${by ? ` (${by})` : ''}.`);
        return load();
      })
      .then(() => openAgent(open))
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  };

  const suspend = () => {
    if (!form.reason) { setErr('Suspending an agent requires a written reason.'); return; }
    setBusy(true); setErr('');
    api.post(`/agents/${open.agentId}/suspend`, { suspended: !open.suspended, reason: form.reason })
      .then(() => load()).then(() => openAgent(open))
      .catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };

  if (!agents || !dash) return <Skeleton variant="rounded" height={460} />;

  const raising = form && LEVELS.indexOf(form.autonomyLevel) > LEVELS.indexOf(open?.autonomyLevel);

  return (
    <>
      <PageHeader
        icon={SmartToyRoundedIcon} iconColor="#75479C"
        title="Agent operations"
        sub="Every AI agent on the platform — what latitude it holds, what it decided, and who reviewed it"
      />

      <PageStats cards={[
        { label: 'Agents registered', value: dash.agents, sub: `${dash.active} active · ${dash.suspended} suspended`, tone: dash.suspended ? 'warning' : 'default' },
        { label: 'Decisions on record', value: dash.decisions.toLocaleString(), sub: `${dash.decisions30d} in the last 30 days` },
        { label: 'Applied without a human', value: `${dash.autoAppliedPct}%`, sub: 'of all recorded decisions' },
        { label: 'Awaiting human review', value: dash.pendingReview, sub: 'escalated or queued', tone: dash.pendingReview ? 'warning' : 'success' },
        { label: 'Agreement rate', value: dash.agreementRate == null ? '—' : `${dash.agreementRate}%`, sub: 'reviewed decisions not overturned', tone: 'success' },
        { label: 'Average confidence', value: dash.avgConfidence, sub: 'across every decision' },
        ...dash.byLevel.map((l) => ({
          label: LEVEL_META[l.level][0], value: l.count, sub: 'agents at this level',
        })),
      ]} />

      <Card sx={{ p: 0 }}>
        <Box sx={{ p: 1.75, pb: 1.25 }}>
          <Typography sx={{ fontWeight: 700, fontSize: 14 }}>Agent register</Typography>
          <Typography variant="caption" color="text.secondary">
            Autonomy is a setting, not a release. Raising it requires a written reason and is recorded against the agent.
          </Typography>
        </Box>
        <Divider />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2,1fr)', xl: 'repeat(3,1fr)' }, gap: 1.5, p: 1.75 }}>
          {agents.map((a) => {
            const [label, colour, blurb] = LEVEL_META[a.autonomyLevel] || [a.autonomyLevel, 'default', ''];
            return (
              <Card
                key={a.agentId} variant="outlined"
                onClick={() => openAgent(a)}
                sx={{ p: 1.5, cursor: 'pointer', transition: 'all .15s',
                  borderColor: a.suspended ? 'error.main' : 'divider',
                  '&:hover': { borderColor: 'primary.main', transform: 'translateY(-2px)', boxShadow: 3 } }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: 13.5, flex: 1 }} noWrap>{a.name}</Typography>
                  {a.suspended
                    ? <Chip size="small" color="error" label="Suspended" sx={{ height: 20, fontSize: 10.5 }} />
                    : <Tooltip title={blurb}><Chip size="small" color={colour} label={label} sx={{ height: 20, fontSize: 10.5 }} /></Tooltip>}
                </Stack>
                <Typography sx={{ fontSize: 11.5, color: 'text.secondary', minHeight: 32 }}>{a.role || '—'}</Typography>
                <Divider sx={{ my: 1 }} />
                <Stack direction="row" spacing={2}>
                  <Metric k="Decisions" v={a.stats?.decisions ?? 0} />
                  <Metric k="Escalated" v={a.stats?.escalated ?? 0} />
                  <Metric k="Overturned" v={a.stats?.overridden ?? 0} />
                  <Metric k="Agreement" v={a.agreementRate == null ? '—' : `${a.agreementRate}%`} />
                </Stack>
                <Typography sx={{ mt: 1, fontSize: 10.5, color: 'text.secondary', fontFamily: '"IBM Plex Mono",monospace' }}>
                  threshold {a.confidenceThreshold} · max {a.maxActionsPerHour}/h
                  {a.escalateTo ? ` · escalates to ${a.escalateTo}` : ''}
                </Typography>
              </Card>
            );
          })}
        </Box>
      </Card>

      {/* ------------------------------------------------ agent detail drawer */}
      <Drawer anchor="right" open={!!open} onClose={() => setOpen(null)}
        PaperProps={{ sx: { width: { xs: '100%', md: '58vw' }, p: 2.5, display: 'block', overflowY: 'auto' } }}>
        {open && form && (
          <>
            <Stack direction="row" alignItems="flex-start" sx={{ mb: 1 }}>
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 19 }}>{open.name}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {open.agentId} · {open.role} {open.domain ? `· Domain ${open.domain}` : ''}
                </Typography>
              </Box>
              <IconButton onClick={() => setOpen(null)}><CloseRoundedIcon /></IconButton>
            </Stack>

            {open.suspended && (
              <Alert severity="error" sx={{ mb: 1.5 }}>
                Suspended by {open.suspendedBy || 'an officer'} — {open.suspendedReason || 'no reason recorded'}
              </Alert>
            )}
            {err && <Alert severity="error" sx={{ mb: 1.5 }}>{err}</Alert>}
            {note && <Alert severity="success" sx={{ mb: 1.5 }}>{note}</Alert>}

            <Card variant="outlined" sx={{ p: 1.75, mb: 2 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 1.25 }}>Latitude</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  select size="small" label="Autonomy level" sx={{ minWidth: 210 }}
                  value={form.autonomyLevel} disabled={!canConfigure}
                  onChange={(e) => setForm({ ...form, autonomyLevel: e.target.value })}
                >
                  {LEVELS.map((l) => <MenuItem key={l} value={l}>{LEVEL_META[l][0]}</MenuItem>)}
                </TextField>
                <Box sx={{ flex: 1, minWidth: 220 }}>
                  <Typography variant="caption" color="text.secondary">
                    Confidence threshold — below this an agent must escalate
                  </Typography>
                  <Slider
                    size="small" min={0} max={1} step={0.01} valueLabelDisplay="auto"
                    value={form.confidenceThreshold} disabled={!canConfigure}
                    onChange={(_, v) => setForm({ ...form, confidenceThreshold: v })}
                  />
                </Box>
              </Stack>
              <Typography sx={{ fontSize: 11.5, color: 'text.secondary', mt: 0.5 }}>
                {LEVEL_META[form.autonomyLevel][2]}
              </Typography>
              {raising && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                  You are raising this agent’s autonomy. A written reason is required and will be recorded.
                </Alert>
              )}
              <TextField
                size="small" fullWidth sx={{ mt: 1.5 }} label="Reason for this change"
                value={form.reason} disabled={!canConfigure}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
              {canConfigure && (
                <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
                  <Button variant="contained" size="small" disabled={busy} onClick={save}>Save configuration</Button>
                  {RUNNABLE(open.agentId) && (
                    <Button
                      variant="outlined" size="small" disabled={busy || open.suspended || !open.enabled}
                      startIcon={<PlayArrowRoundedIcon />} onClick={runNow}
                    >
                      Run now
                    </Button>
                  )}
                  <Button
                    variant="outlined" size="small" color={open.suspended ? 'success' : 'error'} disabled={busy}
                    startIcon={open.suspended ? <PlayArrowRoundedIcon /> : <BlockRoundedIcon />}
                    onClick={suspend}
                  >
                    {open.suspended ? 'Reinstate agent' : 'Suspend agent'}
                  </Button>
                </Stack>
              )}
            </Card>

            {!!(open.changes || []).length && (
              <Card variant="outlined" sx={{ p: 1.75, mb: 2 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 1 }}>Governance history</Typography>
                <Stack spacing={0.75}>
                  {open.changes.slice().reverse().map((c, i) => (
                    <Typography key={i} sx={{ fontSize: 11.5, color: 'text.secondary' }}>
                      <b>{c.field}</b> {c.from} → {c.to} · {fmtDT(c.at)} · {c.by}
                      {c.reason ? ` — “${c.reason}”` : ''}
                    </Typography>
                  ))}
                </Stack>
              </Card>
            )}

            <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 1 }}>
              Recent decisions ({(open.recentDecisions || []).length})
            </Typography>
            <Stack spacing={1}>
              {(open.recentDecisions || []).map((d) => <DecisionCard key={d._id} d={d} />)}
              {!(open.recentDecisions || []).length && (
                <Typography variant="body2" color="text.secondary">No decisions recorded yet.</Typography>
              )}
            </Stack>
          </>
        )}
      </Drawer>
    </>
  );
}

function Metric({ k, v }) {
  return (
    <Box>
      <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 15, lineHeight: 1.1 }}>{v}</Typography>
      <Typography sx={{ fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>{k}</Typography>
    </Box>
  );
}

const DISP = {
  AUTO_APPLIED: ['Applied automatically', 'success'],
  ESCALATED: ['Escalated to a human', 'warning'],
  AWAITING_REVIEW: ['Awaiting review', 'default'],
  APPROVED_BY_HUMAN: ['Approved by a human', 'info'],
  OVERRIDDEN: ['Overturned by a human', 'error'],
  REJECTED_BY_HUMAN: ['Rejected by a human', 'error'],
};

export function DecisionCard({ d }) {
  const [label, colour] = DISP[d.disposition] || [d.disposition, 'default'];
  const factors = d.factors || [];
  const max = Math.max(1, ...factors.map((f) => Math.abs(f.contribution || 0)));
  return (
    <Card variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 12.5, flex: 1 }}>{d.action}</Typography>
        <Chip size="small" color={colour} label={label} sx={{ height: 19, fontSize: 10 }} />
      </Stack>
      <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>
        {d.subjectType} {d.subjectLabel ? `· ${d.subjectLabel}` : ''} · {fmtDT(d.at)}
      </Typography>
      {d.explanation && (
        <Typography sx={{ fontSize: 12, mt: 0.75 }}>{d.explanation}</Typography>
      )}
      {!!factors.length && (
        <Box sx={{ mt: 1 }}>
          <Typography sx={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.5 }}>
            What drove it
          </Typography>
          {factors.map((f, i) => (
            <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.4 }}>
              <Typography sx={{ fontSize: 11, width: 150 }} noWrap>{f.factor}</Typography>
              <LinearProgress
                variant="determinate" value={Math.min(100, (Math.abs(f.contribution || 0) / max) * 100)}
                sx={{ flex: 1, height: 6, borderRadius: 3 }}
              />
              <Typography sx={{ fontSize: 10.5, width: 70, textAlign: 'right', fontFamily: '"IBM Plex Mono",monospace', color: 'text.secondary' }}>
                {f.value ?? f.contribution}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      <Typography sx={{ mt: 1, fontSize: 10.5, fontFamily: '"IBM Plex Mono",monospace', color: 'text.secondary' }}>
        confidence {d.confidence} · threshold {d.threshold} · {d.autonomyLevel?.toLowerCase()}
        {d.modelVersion ? ` · ${d.modelId || 'model'} ${d.modelVersion}` : ''}
        {d.latencyMs ? ` · ${d.latencyMs} ms` : ''}
      </Typography>
      {d.reviewedBy && (
        <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>
          Reviewed by {d.reviewedBy}{d.overrideReason ? ` — “${d.overrideReason}”` : ''}
        </Typography>
      )}
    </Card>
  );
}
