import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import {
  Card, Box, Typography, Skeleton, Stack, Button, Table, TableHead, TableRow, TableCell,
  TableBody, TableContainer, Divider, Chip,
} from '@mui/material';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import GridOnRoundedIcon from '@mui/icons-material/GridOnRounded';
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import PageHeader from '../../components/common/PageHeader';
import { exportExcel, exportPdf } from '../../utils/exportUtils';

/* Generic report viewer — renders any /reports/run/:key payload
 * (multi-section tables) with Excel / PDF / print export. */
export default function ReportViewer() {
  const { key } = useParams();
  const dispatch = useDispatch();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setData(null);
    api.get(`/reports/run/${key}`).then((r) => setData(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  };
  useEffect(() => { load(); }, [key]); // eslint-disable-line

  const doExcel = async () => {
    setBusy(true);
    try {
      await exportExcel({ name: key, sheets: data.sections.map((s, i) => ({ name: s.heading?.slice(0, 26) || `Sheet${i + 1}`, columns: s.columns, rows: s.rows })) });
      dispatch(notify('Excel export ready'));
    } catch (e) { dispatch(notify({ message: e.message, severity: 'error' })); } finally { setBusy(false); }
  };
  const doPdf = async () => {
    setBusy(true);
    try {
      await exportPdf({ name: key, title: data.title, subtitle: data.subtitle, sections: data.sections, landscape: true });
      dispatch(notify('PDF export ready'));
    } catch (e) { dispatch(notify({ message: e.message, severity: 'error' })); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader
        icon={AssessmentRoundedIcon} iconColor="#0B5D8A"
        crumbs={[{ label: 'Report library', to: '/reports' }, { label: data?.title || key }]}
        title={data?.title || 'Running report…'}
        sub={data ? `${data.subtitle || ''} · generated ${new Date(data.generatedAt).toLocaleString('en-IN', { hour12: false })} IST` : undefined}
        actions={(
          <Stack direction="row" spacing={1} sx={{ displayPrint: 'none' }}>
            <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={load}>Re-run</Button>
            <Button size="small" variant="outlined" startIcon={<GridOnRoundedIcon />} onClick={doExcel} disabled={!data || busy}>Excel</Button>
            <Button size="small" variant="outlined" startIcon={<PictureAsPdfRoundedIcon />} onClick={doPdf} disabled={!data || busy}>PDF</Button>
            <Button size="small" variant="contained" startIcon={<PrintRoundedIcon />} onClick={() => window.print()} disabled={!data}>Print</Button>
          </Stack>
        )}
      />
      {!data ? <Skeleton variant="rounded" height={480} /> : (
        <Stack spacing={2.5}>
          {data.sections.map((s, i) => (
            <Card key={i}>
              {s.heading && (
                <>
                  <Box sx={{ px: 2, py: 1.25, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="h6" sx={{ fontSize: 14.5 }}>{s.heading}</Typography>
                    <Chip size="small" variant="outlined" label={`${s.rows.length} rows`} sx={{ height: 18, fontSize: 10 }} />
                  </Box>
                  <Divider />
                </>
              )}
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>{s.columns.map((c) => <TableCell key={c.key} align={c.align}>{c.label}</TableCell>)}</TableRow>
                  </TableHead>
                  <TableBody>
                    {s.rows.map((r, j) => (
                      <TableRow key={j} hover sx={r.vessel === 'VACANT' || r.vessel === 'UNDER MAINTENANCE' ? { opacity: 0.55 } : undefined}>
                        {s.columns.map((c) => (
                          <TableCell key={c.key} align={c.align}
                            sx={['vcn', 'berth', 'number', 'code', 'imo', 'no'].includes(c.key) ? { fontFamily: '"IBM Plex Mono",monospace', fontSize: 12 } : { fontSize: 12.5 }}>
                            {r[c.key] ?? '—'}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {s.rows.length === 0 && (
                      <TableRow><TableCell colSpan={s.columns.length}>
                        <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Nothing to report in this section.</Typography>
                      </TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          ))}
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
            Mundra Port Operations Portal · demo data · fictional transactions on a researched real-infrastructure base
          </Typography>
        </Stack>
      )}
    </>
  );
}
