import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Grid, Box, Typography, Skeleton, Stack, Button, Tabs, Tab, TextField, MenuItem,
  Switch, FormControlLabel, Divider, Chip, Alert,
} from '@mui/material';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import MarkEmailReadRoundedIcon from '@mui/icons-material/MarkEmailReadRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import MailRoundedIcon from '@mui/icons-material/MailRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';

/* Platform settings — organisation, operations, billing & tax, notifications,
 * SMTP (outbound mail) and the AI assistant. Every save loops straight back
 * into behaviour: GST on new invoices, cert windows, the assistant's model. */

const AI_MODELS = [
  { value: 'claude-opus-5', label: 'Claude Opus 5 (recommended)' },
  { value: 'claude-sonnet-5', label: 'Claude Sonnet 5 (faster)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (lightest)' },
];

const TABS = [
  { key: 'org', label: 'Organisation', icon: ApartmentRoundedIcon },
  { key: 'operations', label: 'Operations', icon: TuneRoundedIcon },
  { key: 'billing', label: 'Billing & tax', icon: ReceiptLongRoundedIcon },
  { key: 'notifications', label: 'Notifications', icon: NotificationsActiveRoundedIcon },
  { key: 'smtp', label: 'SMTP', icon: MailRoundedIcon },
  { key: 'ai', label: 'AI assistant', icon: AutoAwesomeRoundedIcon },
];

const F = ({ children }) => <Grid item xs={12} sm={6} md={4}>{children}</Grid>;

export default function SettingsPage() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const canManage = hasPerm(user, 'settings.manage');
  const [all, setAll] = useState(null);
  const [tab, setTab] = useState(0);
  const [vals, setVals] = useState({});
  const [busy, setBusy] = useState(false);
  const [smtpResult, setSmtpResult] = useState(null);

  const section = TABS[tab].key;
  const load = () => api.get('/settings').then((r) => { setAll(r.data); setVals(r.data[TABS[tab].key] || {}); })
    .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  useEffect(() => { load(); }, []); // eslint-disable-line
  useEffect(() => { if (all) { setVals(all[section] || {}); setSmtpResult(null); } }, [tab]); // eslint-disable-line

  const set = (k) => (e) => setVals((v) => ({ ...v, [k]: e?.target?.type === 'checkbox' ? e.target.checked : e.target.value }));
  const save = () => {
    setBusy(true);
    api.put(`/settings/${section}`, vals)
      .then((r) => { dispatch(notify(`${TABS[tab].label} settings saved`)); setAll((a) => ({ ...a, [section]: r.data })); setVals(r.data); })
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
      .finally(() => setBusy(false));
  };
  const testSmtp = () => {
    setBusy(true); setSmtpResult(null);
    api.post('/settings/smtp/test', vals)
      .then((r) => setSmtpResult({ ok: true, text: r.data.detail }))
      .catch((e) => setSmtpResult({ ok: false, text: e.message }))
      .finally(() => setBusy(false));
  };

  if (!all) return <Skeleton variant="rounded" height={480} />;
  const t = (k, label, extra = {}) => (
    <TextField fullWidth size="small" label={label} value={vals[k] ?? ''} onChange={set(k)} disabled={!canManage} {...extra} />
  );
  const sw = (k, label) => (
    <FormControlLabel control={<Switch checked={!!vals[k]} onChange={set(k)} disabled={!canManage} />} label={label} />
  );

  return (
    <>
      <PageHeader
        icon={SettingsRoundedIcon} iconColor="#0A2239"
        title="Platform settings" sub="Global configuration — each section feeds live behaviour across the portal"
        actions={canManage && <Button variant="contained" startIcon={<SaveRoundedIcon />} onClick={save} disabled={busy}>Save {TABS[tab].label}</Button>}
      />
      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" allowScrollButtonsMobile sx={{ px: 1, borderBottom: 1, borderColor: 'divider' }}>
          {TABS.map((tb) => { const I = tb.icon; return <Tab key={tb.key} icon={<I sx={{ fontSize: 17 }} />} iconPosition="start" label={tb.label} sx={{ minHeight: 48 }} />; })}
        </Tabs>
        <Box sx={{ p: 2.5 }}>
          {section === 'org' && (
            <Grid container spacing={2}>
              <F>{t('portName', 'Port name')}</F><F>{t('operator', 'Operator')}</F><F>{t('unlocode', 'UN/LOCODE')}</F>
              <Grid item xs={12} md={8}>{t('address', 'Address')}</Grid><F>{t('gstin', 'GSTIN')}</F>
              <F>{t('currency', 'Base currency')}</F><F>{t('timezone', 'Timezone')}</F>
              <F>{t('contactEmail', 'Contact email')}</F><F>{t('contactPhone', 'Contact phone')}</F>
            </Grid>
          )}
          {section === 'operations' && (
            <Grid container spacing={2}>
              <F>{t('workingHours', 'Working hours')}</F>
              <F>{t('pilotBoardingGround', 'Pilot boarding ground')}</F>
              <F>{t('vhfWorkingChannel', 'VHF working channel')}</F>
              <F>{t('marsecLevel', 'MARSEC level', { type: 'number' })}</F>
              <Grid item xs={12}><Divider /></Grid>
              <Grid item xs={12}>{sw('monsoonMode', 'Monsoon working restrictions in force (adds UKC margin note to berthing confirmations)')}</Grid>
            </Grid>
          )}
          {section === 'billing' && (
            <Grid container spacing={2}>
              <F>{t('gstRate', 'GST rate (%) — applied to every NEW invoice', { type: 'number' })}</F>
              <F>{t('placeOfSupply', 'Place of supply')}</F>
              <F>{t('sacCode', 'SAC code (port services)')}</F>
              <Grid item xs={12}><Divider /></Grid>
              <Grid item xs={12} md={6}>{sw('roundToRupee', 'Round invoice totals to the rupee')}</Grid>
              <Grid item xs={12} md={6}>{sw('creditNoteApproval', 'Credit notes need Finance Manager approval')}</Grid>
            </Grid>
          )}
          {section === 'notifications' && (
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>{sw('certExpiryDigest', 'Daily certificate-expiry digest to Fleet & Survey roles')}</Grid>
              <Grid item xs={12} md={6}>{sw('incidentPush', 'Immediate push on HIGH / CRITICAL incidents')}</Grid>
              <Grid item xs={12} md={6}>{sw('invoiceOverdueDigest', 'Weekly overdue-invoice digest to Billing')}</Grid>
              <F>{t('digestHourIst', 'Digest hour (IST, 24h)', { type: 'number' })}</F>
            </Grid>
          )}
          {section === 'smtp' && (
            <Grid container spacing={2}>
              <Grid item xs={12}>{sw('enabled', 'Outbound mail enabled')}</Grid>
              <F>{t('host', 'SMTP host', { placeholder: 'smtp.example.in' })}</F>
              <F>{t('port', 'Port', { type: 'number' })}</F>
              <Grid item xs={12} sm={6} md={4} sx={{ display: 'flex', alignItems: 'center' }}>{sw('secure', 'TLS / STARTTLS')}</Grid>
              <F>{t('username', 'Username')}</F>
              <F>{t('password', 'Password', { type: 'password', helperText: 'Stored masked — retype to change' })}</F>
              <F>{t('fromName', 'From name')}</F>
              <F>{t('fromEmail', 'From email')}</F>
              <Grid item xs={12}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <Button variant="outlined" startIcon={<MarkEmailReadRoundedIcon />} onClick={testSmtp} disabled={busy || !canManage}>Test connection</Button>
                  <Typography variant="caption" color="text.secondary">Digest and alert mails (certificates, incidents, overdue invoices) go out through this profile.</Typography>
                </Stack>
                {smtpResult && <Alert sx={{ mt: 1.5 }} severity={smtpResult.ok ? 'success' : 'error'}>{smtpResult.text}</Alert>}
              </Grid>
            </Grid>
          )}
          {section === 'ai' && (
            <Grid container spacing={2}>
              <Grid item xs={12}>{sw('enabled', 'AI assistant enabled for permitted roles')}</Grid>
              <F>
                <TextField select fullWidth size="small" label="Model" value={vals.model ?? 'claude-opus-5'} onChange={set('model')} disabled={!canManage}>
                  {AI_MODELS.map((m) => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
                </TextField>
              </F>
              <F>{t('apiKey', 'Anthropic API key', { type: 'password', helperText: 'Stored masked — retype to change. Falls back to the server environment key.' })}</F>
              <F>{t('temperature', 'Temperature', { type: 'number', inputProps: { step: 0.1, min: 0, max: 1 } })}</F>
              <F>{t('dailyTokenBudget', 'Daily token budget', { type: 'number' })}</F>
              <Grid item xs={12}>{sw('groundedOnly', 'Grounded-only mode (skip the LLM polish; deterministic engine answers directly)')}</Grid>
              <Grid item xs={12}>
                <Chip size="small" variant="outlined" icon={<AutoAwesomeRoundedIcon sx={{ fontSize: 14 }} />}
                  label="Answers are always grounded in live portal records; the model only phrases them. Changes apply to the next question — no restart." sx={{ fontSize: 11, py: 1.5 }} />
              </Grid>
            </Grid>
          )}
        </Box>
      </Card>
    </>
  );
}
