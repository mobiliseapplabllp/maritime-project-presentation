import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Card, Chip, Skeleton, Table, TableHead, TableRow, TableCell, TableBody, Typography, Box, TableContainer } from '@mui/material';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import PageHeader from '../../components/common/PageHeader';
import StatusChip from '../../components/common/StatusChip';
import { PORTCALL_STATUS_META } from '../../utils/status';
import { fmtDT } from '../../utils/format';
import { BAND_META, ScoreBar } from './RiskRegister';

export default function TargetingPage() {
  const [rows, setRows] = useState(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  useEffect(() => {
    api.get('/risk/targeting').then((r) => setRows(r.data))
      .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  }, []); // eslint-disable-line

  if (!rows) return <Skeleton variant="rounded" height={480} />;
  return (
    <>
      <PageHeader icon={TrackChangesRoundedIcon} iconColor="#9C6412" title="PSC targeting list" sub="Vessels currently in port or inbound, ordered by risk — spend surveyor hours where the evidence points" />
      <Card>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead><TableRow>
              <TableCell sx={{ width: 44 }}>#</TableCell><TableCell>Vessel</TableCell><TableCell>Call</TableCell>
              <TableCell>Status</TableCell><TableCell>ETA / berth</TableCell><TableCell>Risk</TableCell>
              <TableCell>Band</TableCell><TableCell>Primary driver</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {rows.map((r, i) => {
                const [bl, bc] = BAND_META[r.risk.band];
                return (
                  <TableRow key={r.callId} hover sx={{ cursor: 'pointer' }} onClick={() => navigate(`/port-calls/${r.callId}`)}>
                    <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', color: 'text.secondary' }}>{String(i + 1).padStart(2, '0')}</TableCell>
                    <TableCell><b>{r.vessel}</b></TableCell>
                    <TableCell sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 12.5 }}>{r.vcn}</TableCell>
                    <TableCell><StatusChip value={r.status} map={PORTCALL_STATUS_META} /></TableCell>
                    <TableCell>{r.berth ? <Chip size="small" variant="outlined" label={`Berth ${r.berth}`} sx={{ height: 20, fontSize: 10.5, fontFamily: '"IBM Plex Mono",monospace' }} /> : fmtDT(r.eta)}</TableCell>
                    <TableCell sx={{ minWidth: 150 }}><ScoreBar score={r.risk.score} band={r.risk.band} /></TableCell>
                    <TableCell><Chip size="small" label={bl} color={bc} sx={{ height: 21, fontSize: 11 }} /></TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {r.risk.factors[0] ? `${r.risk.factors[0].label} — ${r.risk.factors[0].evidence}` : '—'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ p: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Selection is explainable by construction: expand any vessel in the risk register for the full factor breakdown. Behavioural signals advise; they never auto-detain.
          </Typography>
        </Box>
      </Card>
    </>
  );
}
