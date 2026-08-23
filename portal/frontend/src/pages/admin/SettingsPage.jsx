import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Card, Button, Box, Skeleton, Typography, Divider } from '@mui/material';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import FormFields from '../../components/common/FormFields';

export default function SettingsPage() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [values, setValues] = useState(null);
  const [busy, setBusy] = useState(false);
  const canManage = hasPerm(user, 'settings.manage');

  useEffect(() => {
    api.get('/settings').then((r) => setValues(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, []); // eslint-disable-line

  if (!values) return <Skeleton variant="rounded" height={360} />;

  return (
    <>
      <PageHeader title="Settings" sub="Organisation profile printed on invoices and shown across the portal" />
      <Card sx={{ p: 3, maxWidth: 760 }}>
        <Typography variant="h6" sx={{ fontSize: 15, mb: 2 }}>Port profile</Typography>
        <FormFields
          fields={[
            { name: 'portName', label: 'Port name', required: true, disabled: !canManage },
            { name: 'operator', label: 'Operator', disabled: !canManage },
            { name: 'unlocode', label: 'UN/LOCODE', disabled: !canManage },
            { name: 'gstin', label: 'GSTIN', disabled: !canManage },
            { name: 'address', label: 'Address', type: 'multiline', cols: 12, disabled: !canManage },
            { name: 'currency', label: 'Currency', disabled: !canManage },
            { name: 'timezone', label: 'Timezone', disabled: !canManage },
            { name: 'contactEmail', label: 'Contact email', disabled: !canManage },
            { name: 'contactPhone', label: 'Contact phone', disabled: !canManage },
          ]}
          values={values} onChange={setValues}
        />
        {canManage && (
          <>
            <Divider sx={{ my: 2.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="contained" disabled={busy} onClick={() => {
                setBusy(true);
                api.put('/settings', values)
                  .then(() => dispatch(notify('Settings saved')))
                  .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
                  .finally(() => setBusy(false));
              }}>Save settings</Button>
            </Box>
          </>
        )}
      </Card>
    </>
  );
}
