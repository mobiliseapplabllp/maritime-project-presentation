import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  Card, Box, Typography, Chip, Stack, Skeleton, Table, TableHead, TableRow, TableCell, TableBody,
  Collapse, IconButton, Button, Slider, Grid, Divider, TableContainer,
} from '@mui/material';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import FormDrawer from '../../components/common/FormDrawer';

export const BAND_META = { LOW: ['Low', 'success'], MEDIUM: ['Medium', 'warning'], HIGH: ['High', 'error'] };
const WEIGHT_LABELS = {
  age: 'Vessel age', certificates: 'Statutory certificates', deficiencies: 'Open deficiencies',
  detentions: 'Detention history', inspectionGap: 'Time since inspection', agentPerformance: 'Agent fleet record',
};

export function ScoreBar({ score, band }) {
  const color = band === 'HIGH' ? 'error.main' : band === 'MEDIUM' ? 'warning.main' : 'success.main';
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 130 }}>
      <Box sx={{ flex: 1, height: 7, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden' }}>
        <Box sx={{ width: `${score}%`, height: '100%', bgcolor: color, borderRadius: 4 }} />
      </Box>
      <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 13, fontWeight: 600, width: 26, textAlign: 'right' }}>{score}</Typography>
    </Stack>
  );
}

function Row({ r }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const [bl, bc] = BAND_META[r.band];
  return (
    <>
      <TableRow hover sx={{ cursor: 'pointer', '& td': { borderBottom: open ? 0 : undefined } }} onClick={() => setOpen(!open)}>
        <TableCell sx={{ width: 34, px: 1 }}>
          <IconButton size="small">{open ? <KeyboardArrowUpRoundedIcon fontSize="inherit" /> : <KeyboardArrowDownRoundedIcon fontSize="inherit" />}</IconButton>
        </TableCell>
        <TableCell><b>{r.name}</b></TableCell>
        <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5 }}>{r.imo}</TableCell>
        <TableCell>{r.type}</TableCell>
        <TableCell>{r.flag}</TableCell>
        <TableCell>{r.built}</TableCell>
        <TableCell sx={{ minWidth: 160 }}><ScoreBar score={r.score} band={r.band} /></TableCell>
        <TableCell><Chip size="small" label={bl} color={bc} sx={{ height: 21, fontSize: 11 }} /></TableCell>
      </TableRow>
      <TableRow>
        <TableCell colSpan={8} sx={{ py: 0, borderBottom: open ? undefined : 0 }}>
          <Collapse in={open} unmountOnExit>
            <Box sx={{ py: 1.5, pl: 5, pr: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Factor decomposition — every point traces to a record; nothing in this score is a black box.
              </Typography>
              <Grid container spacing={1}>
                {r.factors.map((f) => (
                  <Grid item xs={12} sm={6} md={4} key={f.key}>
                    <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                        <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{f.label}</Typography>
                        <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12 }}>{f.points}/{f.max}</Typography>
                      </Stack>
                      <Box sx={{ height: 4, borderRadius: 3, bgcolor: 'divider', mt: 0.5, mb: 0.5, overflow: 'hidden' }}>
                        <Box sx={{ width: `${(f.points / Math.max(1, f.max)) * 100}%`, height: '100%', bgcolor: 'primary.main' }} />
                      </Box>
                      <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>{f.evidence}</Typography>
                    </Box>
                  </Grid>
                ))}
              </Grid>
              <Button size="small" sx={{ mt: 1 }} onClick={(e) => { e.stopPropagation(); navigate(`/vessels/${r.vesselId}`); }}>Open vessel record →</Button>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}

export default function RiskRegister() {
  const dispatch = useDispatch();
  const user = useSelector((s) => s.auth.user);
  const [rows, setRows] = useState(null);
  const [weights, setWeights] = useState(null);
  const [weightsDlg, setWeightsDlg] = useState(false);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => api.get('/risk/scores').then((r) => { setRows(r.data); setWeights(r.meta.weights); })
    .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  useEffect(() => { load(); }, []); // eslint-disable-line

  if (!rows) return <Skeleton variant="rounded" height={480} />;
  const counts = { HIGH: rows.filter((r) => r.band === 'HIGH').length, MEDIUM: rows.filter((r) => r.band === 'MEDIUM').length, LOW: rows.filter((r) => r.band === 'LOW').length };

  return (
    <>
      <PageHeader
        title="Vessel risk register" sub="Explainable, factor-weighted profiles across the active fleet — recomputed live from operational records"
        actions={hasPerm(user, 'risk.manage') && (
          <Button variant="outlined" startIcon={<TuneRoundedIcon />} onClick={() => { setDraft({ ...weights }); setWeightsDlg(true); }}>Model weights</Button>
        )}
      />
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {Object.entries(counts).map(([band, n]) => {
          const [l, c] = BAND_META[band];
          return <Chip key={band} label={`${l}: ${n}`} color={c} variant="outlined" sx={{ fontWeight: 700 }} />;
        })}
      </Stack>
      <Card>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell /><TableCell>Vessel</TableCell><TableCell>IMO</TableCell><TableCell>Type</TableCell>
              <TableCell>Flag</TableCell><TableCell>Built</TableCell><TableCell>Risk score</TableCell><TableCell>Band</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {rows.map((r) => <Row key={r.vesselId} r={r} />)}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      <FormDrawer
        open={weightsDlg} title="Risk model weights" width="480px"
        subtitle="Weights are policy — every change is audited and versioned"
        onClose={() => setWeightsDlg(false)} busy={busy} submitLabel="Apply weights"
        onSubmit={() => {
          setBusy(true);
          api.put('/risk/weights', draft)
            .then(() => { dispatch(notify('Weights updated — scores recomputed')); setWeightsDlg(false); load(); })
            .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))
            .finally(() => setBusy(false));
        }}>
        <Stack spacing={2.5} divider={<Divider />}>
          {Object.entries(WEIGHT_LABELS).map(([key, label]) => (
            <Box key={key}>
              <Stack direction="row" justifyContent="space-between">
                <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{label}</Typography>
                <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace' }}>{draft[key] ?? 0}</Typography>
              </Stack>
              <Slider size="small" min={0} max={50} value={draft[key] ?? 0}
                onChange={(_, v) => setDraft((d) => ({ ...d, [key]: v }))} />
            </Box>
          ))}
          <Typography variant="caption" color="text.secondary">
            Scores are normalised to 100 across the total weight, so raising one factor lowers the relative influence of the rest.
          </Typography>
        </Stack>
      </FormDrawer>
    </>
  );
}
