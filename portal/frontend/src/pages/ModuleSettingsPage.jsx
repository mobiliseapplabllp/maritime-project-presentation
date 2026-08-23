import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Card, Grid, Box, Typography, Skeleton, Button, TextField, MenuItem, Switch, FormControlLabel, Chip, Stack } from '@mui/material';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import SettingsSuggestRoundedIcon from '@mui/icons-material/SettingsSuggestRounded';
import api from '../api/client';
import { notify } from '../store/uiSlice';
import { hasPerm } from '../utils/perms';
import PageHeader from '../components/common/PageHeader';
import { MODULES } from '../modules';
import { StatePage } from '../components/common/StatePage';

/* Every module carries its own settings page; values loop straight back into
 * that module's behaviour (prefixes, windows, SLA targets, thresholds). */

const FIELDS = {
  ops: [
    { k: 'vcnPrefix', label: 'VCN prefix', help: 'Applied to every NEW vessel call number' },
    { k: 'anchorageAlertHrs', label: 'Anchorage wait alert (hours)', type: 'number', help: 'Waiting beyond this raises an operations flag' },
    { k: 'defaultTugsUnder250m', label: 'Default tugs — LOA < 250 m', type: 'number' },
    { k: 'defaultTugsOver250m', label: 'Default tugs — LOA ≥ 250 m', type: 'number' },
    { k: 'scheduleWindowDays', label: 'Schedule window (days)', type: 'number', help: 'Default span of the vessel schedule board' },
    { k: 'channelSpeedLimitKn', label: 'Channel speed limit (kn)', type: 'number', help: 'Referenced by surveillance speed alerts' },
    { k: 'aisGapAlertMin', label: 'AIS gap alert (minutes)', type: 'number' },
    { k: 'anchorDriftNm', label: 'Anchor drift threshold (NM)', type: 'number' },
    { k: 'zoneEntryWatch', label: 'Alert on unannounced zone entry', type: 'switch' },
  ],
  ships: [
    { k: 'certExpiringDays', label: 'Certificate expiring window (days)', type: 'number', help: 'Drives EXPIRING status across certificates, stats and reports' },
    { k: 'dryDockReminderDays', label: 'Dry-dock reminder (days ahead)', type: 'number' },
    { k: 'riskRefreshMinutes', label: 'Risk score refresh (minutes)', type: 'number' },
  ],
  crew: [
    { k: 'medicalExpiringDays', label: 'Medical expiring window (days)', type: 'number' },
    { k: 'minRestHours', label: 'Minimum rest hours (24 h)', type: 'number' },
    { k: 'cocVerifyOnSignOn', label: 'Verify CoC on sign-on', type: 'switch' },
  ],
  legis: [
    { k: 'ackRequiredDefault', label: 'New notices require acknowledgment by default', type: 'switch' },
    { k: 'ackReminderDays', label: 'Acknowledgment reminder (days)', type: 'number' },
    { k: 'showSupersededDays', label: 'Show superseded instruments for (days)', type: 'number' },
  ],
  incidents: [
    { k: 'mttaTargetMin', label: 'Acknowledge target — MTTA (minutes)', type: 'number', help: 'Shown against actuals on the incident dashboard' },
    { k: 'mttrTargetHrs', label: 'Resolve target — MTTR (hours)', type: 'number', help: 'Shown against actuals on the incident dashboard' },
    { k: 'autoNotifySeverity', label: 'Auto-notify from severity', type: 'select', options: ['MEDIUM', 'HIGH', 'CRITICAL'] },
    { k: 'reopenWindowDays', label: 'Reopen window (days)', type: 'number' },
    { k: 'injuryReportHrs', label: 'Injury report deadline (hours)', type: 'number' },
  ],
  inspect: [
    { k: 'findingDueDays', label: 'Finding rectification default (days)', type: 'number' },
    { k: 'detentionThreshold', label: 'Detainable findings for detention', type: 'number' },
    { k: 'passScorePct', label: 'Checklist pass score (%)', type: 'number' },
    { k: 'requireEvidencePhotos', label: 'Evidence photos mandatory on findings', type: 'switch' },
  ],
  facil: [
    { k: 'licenceValidityYears', label: 'Licence validity (years)', type: 'number' },
    { k: 'auditIntervalMonths', label: 'Audit interval (months)', type: 'number' },
    { k: 'renewalReminderDays', label: 'Renewal reminder (days ahead)', type: 'number' },
  ],
  finance: [
    { k: 'invoicePrefix', label: 'Invoice number prefix', help: 'Applied to every NEW invoice' },
    { k: 'paymentTermsDays', label: 'Payment terms (days)', type: 'number' },
    { k: 'overdueReminderDays', label: 'Overdue reminder cadence (days)', type: 'number' },
    { k: 'roundTotalsToRupee', label: 'Round totals to the rupee', type: 'switch' },
  ],
  mis: [
    { k: 'defaultPeriodMonths', label: 'Default report period (months)', type: 'number' },
    { k: 'exportFooter', label: 'Export footer text', cols: 8 },
  ],
  masters: [
    { k: 'allowHardDelete', label: 'Allow hard delete of master entries', type: 'switch' },
  ],
  admin: [
    { k: 'sessionTimeoutMin', label: 'Session timeout (minutes)', type: 'number' },
    { k: 'passwordMinLength', label: 'Password minimum length', type: 'number' },
    { k: 'auditRetentionDays', label: 'Audit log retention (days)', type: 'number' },
  ],
};

export default function ModuleSettingsPage() {
  const { moduleKey } = useParams();
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const canManage = hasPerm(user, 'settings.manage');
  const mod = MODULES.find((m) => m.key === moduleKey);
  const fields = FIELDS[moduleKey];
  const [vals, setVals] = useState(null);
  const [defaults, setDefaults] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!fields) return;
    setVals(null);
    api.get(`/module-settings/${moduleKey}`)
      .then((r) => { setVals(r.data); setDefaults(r.meta?.defaults || {}); })
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, [moduleKey]); // eslint-disable-line

  if (!mod || !fields) return <StatePage code="404" title="No settings" message="This module has no configurable settings." />;
  if (!vals) return <Skeleton variant="rounded" height={420} />;

  const save = () => {
    setBusy(true);
    api.put(`/module-settings/${moduleKey}`, vals)
      .then((r) => { setVals(r.data); dispatch(notify(`${mod.name} settings saved — changes apply immediately`)); })
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHeader
        icon={SettingsSuggestRoundedIcon} iconColor={mod.color}
        title={`${mod.name} — settings`}
        sub="Module-scoped configuration; every value loops back into this module's behaviour without a restart"
        actions={canManage && (
          <Stack direction="row" spacing={1}>
            <Button startIcon={<RestartAltRoundedIcon />} onClick={() => setVals({ ...defaults })} disabled={busy}>Reset to defaults</Button>
            <Button variant="contained" startIcon={<SaveRoundedIcon />} onClick={save} disabled={busy}>Save settings</Button>
          </Stack>
        )}
      />
      <Card sx={{ p: 2.5 }}>
        <Grid container spacing={2}>
          {fields.map((f) => (
            <Grid item xs={12} sm={6} md={f.cols || 4} key={f.k} sx={f.type === 'switch' ? { display: 'flex', alignItems: 'center' } : undefined}>
              {f.type === 'switch' ? (
                <FormControlLabel
                  control={<Switch checked={!!vals[f.k]} disabled={!canManage}
                    onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.checked }))} />}
                  label={f.label} />
              ) : f.type === 'select' ? (
                <TextField select fullWidth size="small" label={f.label} value={vals[f.k] ?? ''} disabled={!canManage}
                  helperText={f.help} onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.value }))}>
                  {f.options.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                </TextField>
              ) : (
                <TextField fullWidth size="small" label={f.label} type={f.type || 'text'} value={vals[f.k] ?? ''} disabled={!canManage}
                  helperText={f.help}
                  onChange={(e) => setVals((v) => ({ ...v, [f.k]: f.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value }))} />
              )}
            </Grid>
          ))}
        </Grid>
        <Box sx={{ mt: 2 }}>
          <Chip size="small" variant="outlined"
            label={canManage ? 'Saved values override the platform defaults; Reset restores them.' : 'Read-only — the settings.manage permission is required to change these.'}
            sx={{ fontSize: 11 }} />
        </Box>
      </Card>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
        Examples of live hooks: VCN and invoice prefixes stamp new records; the certificate window drives EXPIRING statuses;
        incident MTTA/MTTR targets appear on the incident dashboard; notice defaults pre-fill the publish form.
      </Typography>
    </>
  );
}
