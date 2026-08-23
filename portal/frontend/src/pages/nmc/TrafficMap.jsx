import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Grid, Card, Box, Typography, Chip, Stack, Skeleton, IconButton, Tooltip, Divider, Button } from '@mui/material';
import DoneRoundedIcon from '@mui/icons-material/DoneRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import RadarRoundedIcon from '@mui/icons-material/RadarRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { hasPerm } from '../../utils/perms';
import PageHeader from '../../components/common/PageHeader';
import { fromNow } from '../../utils/format';

/* Stylised Gulf-of-Kutch chart: linear projection over bbox 22.35–22.90 N, 69.20–69.95 E */
const BBOX = { latMin: 22.35, latMax: 22.9, lonMin: 69.2, lonMax: 69.95 };
const W = 980, H = 640;
const X = (lon) => ((lon - BBOX.lonMin) / (BBOX.lonMax - BBOX.lonMin)) * W;
const Y = (lat) => H - ((lat - BBOX.latMin) / (BBOX.latMax - BBOX.latMin)) * H;

const STATUS_COLOR = { MOORED: '#2C6E52', AT_ANCHOR: '#9C6412', UNDERWAY: '#0B74B0', RESTRICTED: '#A33229' };
const ALERT_COLOR = { info: 'info', warning: 'warning', error: 'error' };

export default function TrafficMap() {
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);
  const mode = useSelector((s) => s.ui.mode);
  const dark = mode === 'dark';

  const load = () => api.get('/tracking').then((r) => setData(r.data))
    .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []); // eslint-disable-line

  if (!data) return <Skeleton variant="rounded" height={480} />;
  const sea = dark ? '#0A2233' : '#D7E7EF';
  const seaDeep = dark ? '#071A29' : '#C4DBE8';
  const land = dark ? '#14303F' : '#EFE9DC';
  const landLine = dark ? '#1F4557' : '#CBBFA5';
  const ink = dark ? '#AAC1C7' : '#4A6472';

  return (
    <>
      <PageHeader
        icon={RadarRoundedIcon} iconColor="#0B4F8A" title="Live traffic picture" sub={`${data.positions.length} tracked targets · ${data.coverage}`}
        actions={<Button size="small" startIcon={<RefreshRoundedIcon />} onClick={load}>Refresh</Button>}
      />
      <Grid container spacing={2}>
        <Grid item xs={12} lg={8.5}>
          <Card sx={{ p: 1.5 }}>
            <Box sx={{ overflowX: 'auto' }}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 640, display: 'block', borderRadius: 8 }}>
                {/* sea with depth bands */}
                <rect width={W} height={H} fill={seaDeep} />
                <rect width={W} height={H * 0.62} fill={sea} />
                {/* graticule */}
                {[22.4, 22.5, 22.6, 22.7, 22.8].map((lat) => (
                  <g key={lat}>
                    <line x1="0" y1={Y(lat)} x2={W} y2={Y(lat)} stroke={ink} strokeOpacity="0.16" strokeDasharray="3 6" />
                    <text x="6" y={Y(lat) - 4} fontSize="10" fill={ink} fontFamily="IBM Plex Mono, monospace">{lat.toFixed(1)}°N</text>
                  </g>
                ))}
                {[69.3, 69.5, 69.7, 69.9].map((lon) => (
                  <g key={lon}>
                    <line x1={X(lon)} y1="0" x2={X(lon)} y2={H} stroke={ink} strokeOpacity="0.16" strokeDasharray="3 6" />
                    <text x={X(lon) + 4} y={H - 8} fontSize="10" fill={ink} fontFamily="IBM Plex Mono, monospace">{lon.toFixed(1)}°E</text>
                  </g>
                ))}
                {/* Kutch coastline (north) */}
                <path d={`M0,${Y(22.86)} C ${X(69.35)},${Y(22.83)} ${X(69.5)},${Y(22.88)} ${X(69.62)},${Y(22.84)} C ${X(69.7)},${Y(22.8)} ${X(69.66)},${Y(22.77)} ${X(69.7)},${Y(22.755)} L ${X(69.735)},${Y(22.75)} C ${X(69.8)},${Y(22.77)} ${X(69.9)},${Y(22.82)} ${W},${Y(22.85)} L ${W},0 L 0,0 Z`} fill={land} stroke={landLine} strokeWidth="2" />
                {/* Navinal / port reclamation */}
                <path d={`M ${X(69.685)},${Y(22.762)} L ${X(69.735)},${Y(22.758)} L ${X(69.74)},${Y(22.744)} L ${X(69.69)},${Y(22.742)} Z`} fill={landLine} opacity="0.85" />
                <text x={X(69.7)} y={Y(22.79)} fontSize="12" fontWeight="700" fill={ink} fontFamily="Archivo, sans-serif">MUNDRA PORT</text>
                <text x={X(69.36)} y={Y(22.8)} fontSize="11" fill={ink} fontFamily="Archivo, sans-serif" opacity="0.8">KUTCH</text>
                <text x={X(69.42)} y={Y(22.47)} fontSize="11" fill={ink} fontFamily="Archivo, sans-serif" opacity="0.7">GULF OF KUTCH</text>
                {/* approach channel */}
                <path d={`M ${X(69.715)},${Y(22.74)} L ${X(69.62)},${Y(22.55)} L ${X(69.52)},${Y(22.42)}`} stroke={dark ? '#57B0E3' : '#0B74B0'} strokeWidth="2.5" strokeDasharray="8 6" fill="none" opacity="0.6" />
                <text x={X(69.55)} y={Y(22.47)} fontSize="10" fill={dark ? '#57B0E3' : '#0B74B0'} fontFamily="IBM Plex Mono, monospace" opacity="0.9">APPROACH CH.</text>
                {/* anchorage */}
                <rect x={X(69.745)} y={Y(22.685)} width={X(69.83) - X(69.745)} height={Y(22.63) - Y(22.685)} fill="none" stroke={ink} strokeDasharray="5 4" strokeWidth="1.5" opacity="0.65" rx="6" />
                <text x={X(69.75)} y={Y(22.69) - 5} fontSize="10" fill={ink} fontFamily="IBM Plex Mono, monospace">ANCHORAGE A1</text>
                {/* SPMs */}
                {[[22.635, 69.625], [22.628, 69.642]].map(([lat, lon], i) => (
                  <g key={i}>
                    <circle cx={X(lon)} cy={Y(lat)} r="7" fill="none" stroke={dark ? '#E8B155' : '#9C6412'} strokeWidth="2" />
                    <circle cx={X(lon)} cy={Y(lat)} r="2.4" fill={dark ? '#E8B155' : '#9C6412'} />
                  </g>
                ))}
                <text x={X(69.6)} y={Y(22.615)} fontSize="10" fill={dark ? '#E8B155' : '#9C6412'} fontFamily="IBM Plex Mono, monospace">SPM 1 · 2</text>
                {/* vessels */}
                {data.positions.map((p) => {
                  const sel = selected && selected._id === p._id;
                  const c = STATUS_COLOR[p.navStatus] || '#0B74B0';
                  return (
                    <g key={p._id} transform={`translate(${X(p.lon)},${Y(p.lat)})`} style={{ cursor: 'pointer' }}
                      onClick={() => setSelected(sel ? null : p)}>
                      {sel && <circle r="14" fill={c} opacity="0.18" />}
                      <g transform={`rotate(${p.course})`}>
                        <path d="M0,-8 L5.5,7 L0,3.6 L-5.5,7 Z" fill={c} stroke={dark ? '#071A29' : '#fff'} strokeWidth="1.4" />
                      </g>
                      {p.speed > 0.5 && <line x1="0" y1="0" x2="0" y2={-10 - p.speed} stroke={c} strokeWidth="1.4" transform={`rotate(${p.course})`} opacity="0.55" />}
                      {(sel || data.positions.length <= 24) && (
                        <text x="9" y="4" fontSize="10.5" fontWeight={sel ? 700 : 500} fill={dark ? '#DCE7EA' : '#22404F'} fontFamily="Public Sans, sans-serif">{p.vessel.name.replace(/^M[VT] /, '')}</text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </Box>
            <Stack direction="row" spacing={1.5} sx={{ mt: 1, px: 0.5, flexWrap: 'wrap' }} useFlexGap>
              {Object.entries({ MOORED: 'Moored', AT_ANCHOR: 'At anchor', UNDERWAY: 'Underway' }).map(([k, label]) => (
                <Stack key={k} direction="row" spacing={0.6} alignItems="center">
                  <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: STATUS_COLOR[k] }} />
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                </Stack>
              ))}
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto !important' }}>
                Simulated AIS feed for demonstration — positions refresh every minute
              </Typography>
            </Stack>
          </Card>
        </Grid>
        <Grid item xs={12} lg={3.5}>
          <Stack spacing={2}>
            {selected && (
              <Card sx={{ p: 2 }}>
                <Typography variant="h6" sx={{ fontSize: 15 }}>{selected.vessel.name}</Typography>
                <Typography variant="caption" color="text.secondary">IMO {selected.vessel.imo} · {selected.vessel.type} · {selected.vessel.flag}</Typography>
                <Divider sx={{ my: 1.25 }} />
                <Stack spacing={0.5}>
                  <Typography variant="body2">Status: <b>{selected.navStatus.replace(/_/g, ' ')}</b> · SOG <b>{selected.speed} kn</b> · COG <b>{String(selected.course).padStart(3, '0')}°</b></Typography>
                  <Typography variant="body2">Position: <b>{selected.lat.toFixed(4)}°N {selected.lon.toFixed(4)}°E</b></Typography>
                  <Typography variant="body2">Destination: <b>{selected.destination || '—'}</b> · {fromNow(selected.receivedAt)}</Typography>
                </Stack>
                <Button size="small" sx={{ mt: 1.5 }} variant="outlined" onClick={() => navigate(`/vessels/${selected.vessel._id}`)}>Open vessel record</Button>
              </Card>
            )}
            <Card>
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography variant="h6" sx={{ fontSize: 15 }}>MDA alerts ({data.alerts.length})</Typography>
                <Typography variant="caption" color="text.secondary">Derived signals — advisory, never auto-enforcement</Typography>
              </Box>
              <Divider />
              <Stack divider={<Divider />}>
                {data.alerts.map((a) => (
                  <Box key={a._id} sx={{ p: 1.75, display: 'flex', gap: 1.25 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Chip size="small" label={a.type.replace(/_/g, ' ')} color={ALERT_COLOR[a.severity]} variant="outlined" sx={{ height: 20, fontSize: 10 }} />
                        <Typography noWrap sx={{ fontSize: 12.5, fontWeight: 700 }}>{a.vessel?.name || a.vesselName || 'Unknown target'}</Typography>
                      </Stack>
                      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}>{a.note}</Typography>
                      <Typography variant="caption" color="text.secondary">{fromNow(a.at)}</Typography>
                    </Box>
                    {hasPerm(user, 'nmc.manage') && (
                      <Tooltip title="Acknowledge">
                        <IconButton size="small" onClick={() => api.post(`/tracking/alerts/${a._id}/ack`).then(load).catch((e) => dispatch(notify({ message: e.message, severity: 'error' })))}>
                          <DoneRoundedIcon fontSize="inherit" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Box>
                ))}
                {data.alerts.length === 0 && <Typography color="text.secondary" variant="body2" sx={{ p: 2, textAlign: 'center' }}>No unacknowledged alerts ✅</Typography>}
              </Stack>
            </Card>
          </Stack>
        </Grid>
      </Grid>
    </>
  );
}
