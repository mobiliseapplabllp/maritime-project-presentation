import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Alert, Box, Button, Card, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider,
  Grid, LinearProgress, MenuItem, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow,
  Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AppRegistrationRoundedIcon from '@mui/icons-material/AppRegistrationRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import { fmtD, fmtDT, fmtINR, fmtNum } from '../../utils/format';
import { KIND_META, KindChip, REG_STATUS_META } from './RegistrationsList';

/* B1 — one registration file.
 *
 * The tab that matters is Assessment: it shows the statutory checks re-run
 * against the file as it stands right now, rather than what was recorded when
 * the application was last touched. An officer should never have to guess
 * whether what they are looking at is current. */

const words = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

// Which move an officer can make next, and what to call it in the button.
const NEXT = {
  DRAFT: [['SUBMITTED', 'Lodge the application']],
  SUBMITTED: [['UNDER_SCRUTINY', 'Take up for scrutiny'], ['REJECTED', 'Refuse']],
  UNDER_SCRUTINY: [['CARVING_NOTE_ISSUED', 'Issue the carving and marking note'], ['APPROVED', 'Approve'], ['REJECTED', 'Refuse']],
  CARVING_NOTE_ISSUED: [['SURVEY_COMPLETE', 'Close the survey'], ['REJECTED', 'Refuse']],
  SURVEY_COMPLETE: [['APPROVED', 'Approve'], ['REJECTED', 'Refuse']],
  APPROVED: [],
  GRANTED: [], REJECTED: [], WITHDRAWN: [],
};

function Fact({ label, value, mono, tone }) {
  return (
    <Box>
      <Typography sx={{ fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: 'text.secondary' }}>{label}</Typography>
      <Typography sx={{ fontSize: 14.5, fontWeight: 600, fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined, color: tone }}>
        {value === undefined || value === null || value === '' ? '—' : value}
      </Typography>
    </Box>
  );
}

function CheckRow({ c }) {
  const Icon = c.passed ? CheckCircleRoundedIcon : c.blocking ? ErrorRoundedIcon : WarningAmberRoundedIcon;
  const colour = c.passed ? 'success.main' : c.blocking ? 'error.main' : 'warning.main';
  return (
    <TableRow>
      <TableCell sx={{ width: 34 }}><Icon sx={{ fontSize: 18, color: colour }} /></TableCell>
      <TableCell sx={{ fontSize: 13 }}>{c.check}</TableCell>
      <TableCell sx={{ fontSize: 12.5, color: 'text.secondary' }}>{c.detail}</TableCell>
      <TableCell sx={{ width: 92 }}>
        {!c.passed && <Chip size="small" label={c.blocking ? 'Blocking' : 'Advisory'} color={c.blocking ? 'error' : 'warning'} sx={{ height: 20, fontSize: 10.5 }} />}
      </TableCell>
    </TableRow>
  );
}

export default function RegistrationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [doc, setDoc] = useState(null);
  const [checks, setChecks] = useState(null);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState(null);   // { to, label, needsNote } | { carving: true } | { grant: true }
  const [note, setNote] = useState('');
  const [surveyor, setSurveyor] = useState('');

  const load = useCallback(() => {
    Promise.all([api.get(`/registrations/${id}`), api.get(`/registrations/${id}/checks`).catch(() => null)])
      .then(([d, c]) => { setDoc(d.data); setChecks(c ? c.data : null); })
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, [id, dispatch]);
  useEffect(() => { load(); }, [load]);

  if (!doc) return <LinearProgress />;

  const canAssess = hasPerm(user, 'registry.assess');
  const canGrant = hasPerm(user, 'registry.grant');
  const blocked = (checks && checks.blocked) || [];
  const ledger = doc.shareLedger || {};
  const required = doc.requiredEvidence || [];
  const held = new Set((doc.evidence || []).map((e) => e.key));

  const run = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      dispatch(notify({ message: ok, severity: 'success' }));
      setPrompt(null); setNote(''); setSurveyor('');
      load();
    } catch (e) {
      dispatch(notify({ message: e.message, severity: 'error' }));
    } finally { setBusy(false); }
  };

  const move = (to, override) => run(
    () => api.post(`/registrations/${id}/transition`, { to, note: note || undefined, override }),
    `Application moved to ${words(to)}`,
  );

  const actions = (
    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
      {canAssess && (NEXT[doc.status] || [])
        // only a first registration is carved and surveyed — offering those moves
        // on an amendment or a closure would offer something the register refuses
        .filter(([to]) => doc.kind === 'PERMANENT' || !['CARVING_NOTE_ISSUED', 'SURVEY_COMPLETE'].includes(to))
        .map(([to, label]) => (
        <Button
          key={to} size="small" variant={to === 'REJECTED' ? 'outlined' : 'contained'}
          color={to === 'REJECTED' ? 'error' : 'primary'} disabled={busy}
          onClick={() => setPrompt({ to, label, needsNote: to === 'REJECTED' })}
          >{label}</Button>
        ))}
      {canAssess && doc.status === 'CARVING_NOTE_ISSUED' && !((doc.carvingNote || {}).compliedOn) && (
        <Button size="small" variant="outlined" disabled={busy} onClick={() => setPrompt({ carving: true })}>
          Record carving compliance
        </Button>
      )}
      {canGrant && doc.status === 'APPROVED' && (
        <Button size="small" variant="contained" color="success" disabled={busy} onClick={() => setPrompt({ grant: true })}>
          {doc.kind === 'DELETION' ? 'Grant closure and write the register' : 'Grant and write the register'}
        </Button>
      )}
      {doc.vessel && (
        <Button size="small" variant="text" onClick={() => navigate(`/vessels/${doc.vessel._id || doc.vessel}`)}>
          Open the ship
        </Button>
      )}
    </Stack>
  );

  const facts = (
    <Card sx={{ p: 2, mb: 2 }}>
      <Grid container spacing={2.5}>
        <Grid item xs={6} sm={4} md={2}><Fact label="Transaction" value={(KIND_META[doc.kind] || {}).label} /></Grid>
        <Grid item xs={6} sm={4} md={2}><Fact label="Official number" value={doc.officialNumber} mono /></Grid>
        <Grid item xs={6} sm={4} md={2}><Fact label="Certificate" value={doc.certificateNo} mono /></Grid>
        <Grid item xs={6} sm={4} md={2}><Fact label="Port of registry" value={doc.portOfRegistryName || doc.portOfRegistry} /></Grid>
        <Grid item xs={6} sm={4} md={2}><Fact label="Lodged" value={fmtD(doc.submittedAt)} /></Grid>
        <Grid item xs={6} sm={4} md={2}>
          <Fact
            label="Due" value={fmtD(doc.dueAt)}
            tone={doc.slaBreached ? 'error.main' : undefined}
          />
        </Grid>
      </Grid>
    </Card>
  );

  return (
    <Box>
      <PageHeader
        icon={AppRegistrationRoundedIcon} iconColor="#2C6E52"
        crumbs={[{ label: 'Ship Register', to: '/registry' }, { label: doc.applicationNo }]}
        title={doc.applicationNo}
        sub={`${doc.vesselName} · IMO ${doc.imo} · ${(KIND_META[doc.kind] || {}).label}`}
        actions={actions}
      />

      <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center" flexWrap="wrap" useFlexGap>
        <StatusChip value={doc.status} map={REG_STATUS_META} />
        <KindChip kind={doc.kind} />
        {doc.slaBreached && <Chip size="small" color="error" label="Past the registry SLA" sx={{ height: 22, fontSize: 11 }} />}
        {doc.fee && <Chip size="small" variant="outlined" label={`Fee ${fmtINR(doc.fee.amount)}${doc.fee.paid ? ' · paid' : ' · unpaid'}`} sx={{ height: 22, fontSize: 11 }} />}
      </Stack>

      {blocked.length > 0 && doc.status !== 'GRANTED' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          <b>{blocked.length} statutory condition{blocked.length > 1 ? 's are' : ' is'} not met.</b>{' '}
          {blocked.map((c) => c.detail).join('; ')}
        </Alert>
      )}

      {facts}

      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}>
          <Tab label="Assessment" />
          <Tab label={`Ownership (${(doc.owners || []).length})`} />
          <Tab label={`Evidence (${(doc.evidence || []).length})`} />
          <Tab label="Carving & survey" />
          <Tab label={`Charges (${(doc.encumbrances || []).length})`} />
          <Tab label={`History (${(doc.history || []).length})`} />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ p: 2 }}>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mb: 1.5 }}>
              Re-run against the file as it stands now, not as it stood when the application was last touched.
              A blocking condition stops the grant; an advisory one is recorded and does not.
            </Typography>
            <Table size="small">
              <TableBody>
                {(checks ? checks.checks : doc.checks || []).map((c, i) => <CheckRow key={i} c={c} />)}
              </TableBody>
            </Table>
            {doc.decision && doc.decision.outcome && (
              <Alert severity={doc.decision.outcome === 'GRANTED' ? 'success' : 'error'} sx={{ mt: 2 }}>
                {words(doc.decision.outcome)} by {doc.decision.by} on {fmtDT(doc.decision.at)}
                {doc.decision.reason ? ` — ${doc.decision.reason}` : ''}
              </Alert>
            )}
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} sx={{ mb: 1.5 }} alignItems="center" flexWrap="wrap" useFlexGap>
              <Chip
                size="small" color={ledger.balanced ? 'success' : 'error'}
                label={`${ledger.held ?? 0} of ${ledger.denominator ?? '—'} shares allotted`}
                sx={{ height: 22, fontSize: 11 }}
              />
              <Chip
                size="small" variant="outlined"
                label={`${ledger.owners ?? 0} registered owner(s), maximum ${ledger.maxOwners ?? '—'}`}
                sx={{ height: 22, fontSize: 11 }}
              />
            </Stack>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Owner</TableCell><TableCell>Kind</TableCell>
                  <TableCell>Registration</TableCell><TableCell>Address</TableCell>
                  <TableCell align="right">Shares</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(doc.owners || []).map((o, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ fontWeight: 600 }}>{o.name}</TableCell>
                    <TableCell>{words(o.kind)}</TableCell>
                    <TableCell sx={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>{o.cin || o.pan || '—'}</TableCell>
                    <TableCell sx={{ fontSize: 12.5 }}>{o.address || '—'}</TableCell>
                    <TableCell align="right">{o.shares}</TableCell>
                  </TableRow>
                ))}
                {!(doc.owners || []).length && <TableRow><TableCell colSpan={5} sx={{ color: 'text.secondary' }}>Ownership is not in issue on this transaction.</TableCell></TableRow>}
              </TableBody>
            </Table>
            {doc.tonnage && (doc.tonnage.gross || doc.tonnage.net) && (
              <>
                <Divider sx={{ my: 2 }} />
                <Grid container spacing={2.5}>
                  <Grid item xs={6} sm={3}><Fact label="Gross tonnage" value={fmtNum(doc.tonnage.gross)} /></Grid>
                  <Grid item xs={6} sm={3}><Fact label="Net tonnage" value={fmtNum(doc.tonnage.net)} /></Grid>
                  <Grid item xs={6} sm={3}><Fact label="Measured by" value={doc.tonnage.measuredBy} /></Grid>
                  <Grid item xs={6} sm={3}><Fact label="Certificate" value={doc.tonnage.certificateNo} mono /></Grid>
                </Grid>
              </>
            )}
            {doc.previousFlag && (
              <>
                <Divider sx={{ my: 2 }} />
                <Grid container spacing={2.5}>
                  <Grid item xs={6} sm={4}><Fact label="Previous flag" value={doc.previousFlag} /></Grid>
                  <Grid item xs={6} sm={4}><Fact label="Previous registry" value={doc.previousRegistry} /></Grid>
                  <Grid item xs={6} sm={4}><Fact label="Previous official number" value={doc.previousOfficialNumber} mono /></Grid>
                </Grid>
              </>
            )}
            {doc.kind === 'AMENDMENT' && doc.amendment && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mb: 1 }}>
                  Alteration: {(doc.amendment.types || []).map(words).join(', ') || '—'}
                  {doc.amendment.approvalReference ? ` · prior approval ${doc.amendment.approvalReference}` : ''}
                </Typography>
                <Grid container spacing={2.5}>
                  <Grid item xs={12} sm={6}><Fact label="Before" value={JSON.stringify(doc.amendment.before || {})} /></Grid>
                  <Grid item xs={12} sm={6}><Fact label="After" value={JSON.stringify(doc.amendment.after || {})} /></Grid>
                </Grid>
              </>
            )}
            {doc.kind === 'DELETION' && doc.deletion && (
              <>
                <Divider sx={{ my: 2 }} />
                <Grid container spacing={2.5}>
                  <Grid item xs={6} sm={3}><Fact label="Ground for closure" value={words(doc.deletion.reason)} /></Grid>
                  <Grid item xs={6} sm={3}><Fact label="Receiving flag" value={doc.deletion.newFlag} /></Grid>
                  <Grid item xs={6} sm={3}><Fact label="Effective" value={fmtD(doc.deletion.effectiveOn)} /></Grid>
                  <Grid item xs={6} sm={3}><Fact label="Deletion certificate" value={doc.deletion.certificateNo} mono /></Grid>
                </Grid>
              </>
            )}
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ p: 2 }}>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mb: 1.5 }}>
              What this journey must carry, conditionals resolved — a ship built in India is never asked for a
              deletion certificate it cannot have.
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Document</TableCell><TableCell>Reference</TableCell><TableCell>Issued by</TableCell>
                  <TableCell>Lodged</TableCell><TableCell>Verified</TableCell><TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {required.map((rq) => {
                  const lodged = (doc.evidence || []).find((e) => e.key === rq.key);
                  return (
                    <TableRow key={rq.key}>
                      <TableCell sx={{ fontWeight: 600, fontSize: 13 }}>
                        {rq.label}
                        {rq.mandatory && <Chip size="small" label="Mandatory" variant="outlined" sx={{ ml: 1, height: 18, fontSize: 10 }} />}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>{lodged ? lodged.reference || '—' : '—'}</TableCell>
                      <TableCell sx={{ fontSize: 12.5 }}>{lodged ? lodged.issuedBy || '—' : '—'}</TableCell>
                      <TableCell>{lodged ? fmtD(lodged.createdAt || lodged.issuedOn) : <Chip size="small" color="error" label="Not lodged" sx={{ height: 20, fontSize: 10.5 }} />}</TableCell>
                      <TableCell>
                        {lodged && lodged.verified
                          ? <Tooltip title={`${lodged.verifiedBy} · ${fmtD(lodged.verifiedAt)}`}><Chip size="small" color="success" label="Verified" sx={{ height: 20, fontSize: 10.5 }} /></Tooltip>
                          : lodged ? <Chip size="small" color="warning" label="Awaiting check" sx={{ height: 20, fontSize: 10.5 }} /> : null}
                      </TableCell>
                      <TableCell align="right">
                        {canAssess && lodged && !lodged.verified && (
                          <Button size="small" disabled={busy} onClick={() => run(
                            () => api.put(`/registrations/${id}/evidence/${lodged._id}`, { verified: true }),
                            'Document verified',
                          )}>Verify</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(doc.evidence || []).filter((e) => !required.some((rq) => rq.key === e.key)).map((e) => (
                  <TableRow key={e._id}>
                    <TableCell sx={{ fontSize: 13 }}>{e.label || words(e.key)}</TableCell>
                    <TableCell sx={{ fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>{e.reference || '—'}</TableCell>
                    <TableCell sx={{ fontSize: 12.5 }}>{e.issuedBy || '—'}</TableCell>
                    <TableCell>{fmtD(e.createdAt || e.issuedOn)}</TableCell>
                    <TableCell>{e.verified ? <Chip size="small" color="success" label="Verified" sx={{ height: 20, fontSize: 10.5 }} /> : null}</TableCell>
                    <TableCell />
                  </TableRow>
                ))}
                {!required.length && !(doc.evidence || []).length && (
                  <TableRow><TableCell colSpan={6} sx={{ color: 'text.secondary' }}>No evidence lodged.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            {required.filter((rq) => rq.mandatory && !held.has(rq.key)).length > 0 && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Not yet lodged: {required.filter((rq) => rq.mandatory && !held.has(rq.key)).map((rq) => rq.label).join(', ')}
              </Alert>
            )}
          </Box>
        )}

        {tab === 3 && (
          <Box sx={{ p: 2 }}>
            {doc.kind !== 'PERMANENT' ? (
              <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
                A {words(doc.kind).toLowerCase()} has nothing to carve and nothing to survey — the short path applies.
              </Typography>
            ) : (
              <Grid container spacing={2.5}>
                <Grid item xs={6} sm={3}><Fact label="Carving note" value={(doc.carvingNote || {}).number} mono /></Grid>
                <Grid item xs={6} sm={3}><Fact label="Issued" value={fmtD((doc.carvingNote || {}).issuedOn)} /></Grid>
                <Grid item xs={6} sm={3}><Fact label="Issued by" value={(doc.carvingNote || {}).issuedBy} /></Grid>
                <Grid item xs={6} sm={3}>
                  <Fact
                    label="Compliance reported" value={fmtD((doc.carvingNote || {}).compliedOn)}
                    tone={(doc.carvingNote || {}).compliedOn ? 'success.main' : 'warning.main'}
                  />
                </Grid>
                <Grid item xs={12} sm={6}><Fact label="Surveyor" value={(doc.carvingNote || {}).surveyor} /></Grid>
                <Grid item xs={12}><Fact label="Remarks" value={(doc.carvingNote || {}).remarks} /></Grid>
              </Grid>
            )}
          </Box>
        )}

        {tab === 4 && (
          <Box sx={{ p: 2 }}>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mb: 1.5 }}>
              A registry entry cannot be closed while a charge over the ship is undischarged.
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Charge</TableCell><TableCell>In favour of</TableCell><TableCell align="right">Amount</TableCell>
                  <TableCell>Registered</TableCell><TableCell>Discharged</TableCell><TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {(doc.encumbrances || []).map((e) => (
                  <TableRow key={e._id}>
                    <TableCell>{words(e.kind)}</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{e.holder}</TableCell>
                    <TableCell align="right">{e.amount ? fmtINR(e.amount) : '—'}</TableCell>
                    <TableCell>{fmtD(e.registeredOn)}</TableCell>
                    <TableCell>
                      {e.dischargedOn ? fmtD(e.dischargedOn)
                        : <Chip size="small" color="error" label="Subsisting" sx={{ height: 20, fontSize: 10.5 }} />}
                    </TableCell>
                    <TableCell align="right">
                      {canAssess && !e.dischargedOn && (
                        <Button size="small" disabled={busy} onClick={() => run(
                          () => api.put(`/registrations/${id}/encumbrances/${e._id}`, {}),
                          'Charge recorded as discharged',
                        )}>Record discharge</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!(doc.encumbrances || []).length && (
                  <TableRow><TableCell colSpan={6} sx={{ color: 'text.secondary' }}>Encumbrance register clear.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Box>
        )}

        {tab === 5 && (
          <Box sx={{ p: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>When</TableCell><TableCell>Move</TableCell><TableCell>By</TableCell><TableCell>Note</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {(doc.history || []).slice().reverse().map((h, i) => (
                  <TableRow key={i}>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{fmtDT(h.at)}</TableCell>
                    <TableCell sx={{ fontSize: 12.5 }}>{h.from ? `${words(h.from)} → ` : ''}<b>{words(h.to)}</b></TableCell>
                    <TableCell sx={{ fontSize: 12.5 }}>{h.by}</TableCell>
                    <TableCell sx={{ fontSize: 12.5, color: 'text.secondary' }}>{h.note || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Card>

      <Dialog open={!!prompt} onClose={() => !busy && setPrompt(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontSize: 17 }}>
          {prompt?.carving ? 'Record carving and marking compliance'
            : prompt?.grant ? (doc.kind === 'DELETION' ? 'Close the registry entry' : 'Grant the certificate')
              : prompt?.label}
        </DialogTitle>
        <DialogContent>
          {prompt?.carving && (
            <>
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>
                The official number and registered tonnage have been cut into the main beam and a surveyor has
                verified it. Naming the surveyor is what makes the report a record.
              </Typography>
              <TextField
                autoFocus fullWidth size="small" label="Reporting surveyor" value={surveyor}
                onChange={(e) => setSurveyor(e.target.value)}
              />
            </>
          )}
          {prompt?.grant && (
            <Typography sx={{ fontSize: 13.5 }}>
              {doc.kind === 'DELETION'
                ? `This closes ${doc.vesselName}'s entry, issues the deletion certificate and takes the ship off the register.`
                : `This allocates the certificate number, writes ${doc.vesselName}'s registry entry and puts the ship on the register.`}
            </Typography>
          )}
          {prompt?.to && (
            <>
              {prompt.to === 'APPROVED' && blocked.length > 0 && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {blocked.length} blocking condition{blocked.length > 1 ? 's are' : ' is'} unmet:{' '}
                  {blocked.map((c) => c.detail).join('; ')}. Approving now requires a written reason and is recorded
                  against your name as a registrar override.
                </Alert>
              )}
              <TextField
                autoFocus fullWidth size="small" multiline minRows={2}
                label={prompt.needsNote || (prompt.to === 'APPROVED' && blocked.length) ? 'Reason (required)' : 'Note (optional)'}
                value={note} onChange={(e) => setNote(e.target.value)}
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setPrompt(null)} disabled={busy}>Cancel</Button>
          {prompt?.carving && (
            <Button
              variant="contained" disabled={busy || !surveyor}
              onClick={() => run(() => api.post(`/registrations/${id}/carving-compliance`, { surveyor }), 'Carving and marking recorded')}
            >Record</Button>
          )}
          {prompt?.grant && (
            <Button
              variant="contained" color="success" disabled={busy}
              onClick={() => run(() => api.post(`/registrations/${id}/grant`, {}), 'Register written')}
            >Grant</Button>
          )}
          {prompt?.to && (
            <Button
              variant="contained" color={prompt.to === 'REJECTED' ? 'error' : 'primary'}
              disabled={busy || ((prompt.needsNote || (prompt.to === 'APPROVED' && blocked.length > 0)) && !note)}
              onClick={() => move(prompt.to, prompt.to === 'APPROVED' && blocked.length > 0)}
            >{prompt.to === 'APPROVED' && blocked.length > 0 ? 'Approve with override' : 'Confirm'}</Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
