import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Card, Box, Typography, Stack, Skeleton, Chip, Button, Divider } from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SpaceDashboardRoundedIcon from '@mui/icons-material/SpaceDashboardRounded';
import api from '../../api/client';
import { notify } from '../../store/uiSlice';
import { CHART_SERIES } from '../../theme';
import PageHeader from '../../components/common/PageHeader';
import { fmtDT, fromNow } from '../../utils/format';

/* Stylised 2-D "digital twin" of the quay: every berth as a slot on its terminal,
 * the vessel alongside drawn to scale (LOA vs berth length), the anchorage and
 * inbound traffic below. Data: /ops/twin. Click a ship to open its call. */

const TYPE_GROUP = { CONT: 'container', BULK: 'dryBulk', GEN: 'other', RORO: 'other', TANK: 'liquid', OSV: 'other' };
const SLOT_W = 150; const SLOT_GAP = 10; const QUAY_H = 16; const SHIP_H = 30;

function Ship({ x, y, w, color, label, dark, onClick, title }) {
  const bow = Math.min(16, w * 0.22);
  return (
    <g transform={`translate(${x},${y})`} onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <title>{title}</title>
      <path d={`M0,0 H${w - bow} L${w},${SHIP_H / 2} L${w - bow},${SHIP_H} H0 Z`}
        fill={color} stroke={dark ? '#071A29' : '#FFFFFF'} strokeWidth="1.6" rx="3" />
      <rect x={Math.max(4, w * 0.12)} y={SHIP_H * 0.22} width={Math.max(8, w * 0.24)} height={SHIP_H * 0.56} rx="2"
        fill={dark ? 'rgba(7,26,41,0.45)' : 'rgba(255,255,255,0.45)'} />
      {w > 58 && (
        <text x={w / 2 - bow / 4} y={SHIP_H / 2 + 3.6} textAnchor="middle" fontSize="10" fontWeight="700"
          fill={dark ? '#071A29' : '#FFFFFF'} fontFamily="Public Sans, sans-serif" style={{ pointerEvents: 'none' }}>
          {label}
        </text>
      )}
    </g>
  );
}

export default function PortTwin() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const mode = useSelector((s) => s.ui.mode);
  const dark = mode === 'dark';
  const C = CHART_SERIES[mode];
  const [data, setData] = useState(null);

  const load = () => api.get('/ops/twin').then((r) => setData(r.data))
    .catch((e) => dispatch(notify({ message: e.message, severity: 'error' })));
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []); // eslint-disable-line

  const layout = useMemo(() => {
    if (!data) return null;
    const groups = [];
    for (const b of data.berths) {
      let g = groups.find((x) => x.terminal === b.terminal);
      if (!g) { g = { terminal: b.terminal, berths: [] }; groups.push(g); }
      g.berths.push(b);
    }
    const rowFor = (g) => (g.berths[0].berthType === 'CONTAINER' ? 0 : g.berths[0].berthType === 'SPM' ? 2 : 1);
    const rows = [[], [], []];
    for (const g of groups) rows[rowFor(g)].push(g);
    let maxW = 0;
    const placed = rows.map((row) => {
      let x = 24;
      const out = row.map((g) => {
        const gx = x;
        const w = g.berths.length * (SLOT_W + SLOT_GAP) + 14;
        x += w + 26;
        return { ...g, x: gx, w };
      });
      maxW = Math.max(maxW, x);
      return out;
    });
    return { rows: placed, width: Math.max(1500, maxW + 10) };
  }, [data]);

  if (!data || !layout) return <Skeleton variant="rounded" height={560} />;

  const sea = dark ? '#0A2233' : '#D7E7EF';
  const seaDeep = dark ? '#071A29' : '#C7DEEA';
  const quay = dark ? '#2B4254' : '#B9AC93';
  const apron = dark ? '#122C3C' : '#EDE7DA';
  const ink = dark ? '#AAC1C7' : '#4A6472';
  const free = dark ? '#39566A' : '#9FB4C0';
  const H = 780;
  const ROW_Y = [88, 300, 560];
  const shipColor = (t) => C[TYPE_GROUP[t] || 'other'];
  const occupied = data.berths.filter((b) => b.occupiedBy).length;

  const berthSlot = (b, x, y) => {
    const scale = (b.loaMax ? Math.min(1, (b.occupiedBy?.loa || 0) / b.loaMax) : 0.8) || 0.8;
    const shipW = Math.max(56, (SLOT_W - 14) * scale);
    return (
      <g key={b.code} transform={`translate(${x},${y})`}>
        {/* apron + quay edge */}
        <rect x="0" y={-QUAY_H - 26} width={SLOT_W} height={26} fill={apron} />
        <rect x="0" y={-QUAY_H} width={SLOT_W} height={QUAY_H} fill={quay} rx="2" />
        {b.status !== 'OPERATIONAL' && (
          <g>
            <rect x="0" y={-QUAY_H} width={SLOT_W} height={QUAY_H} fill="url(#maint)" rx="2" />
            <text x={SLOT_W / 2} y={-QUAY_H - 8} textAnchor="middle" fontSize="9" fill={ink} fontFamily="IBM Plex Mono, monospace">MAINTENANCE</text>
          </g>
        )}
        <text x="4" y={-QUAY_H - 32} fontSize="10.5" fontWeight="700" fill={ink} fontFamily="IBM Plex Mono, monospace">{b.code}</text>
        {/* vessel alongside or free water */}
        {b.occupiedBy ? (
          <Ship x={(SLOT_W - shipW) / 2} y={7} w={shipW} color={shipColor(b.occupiedBy.type)} dark={dark}
            label={b.occupiedBy.vessel?.replace(/^M[VT] /, '').split(' ')[0]}
            title={`${b.occupiedBy.vessel} · ${b.occupiedBy.vcn}\n${b.occupiedBy.cargo || 'cargo ops'}\nETD ${b.occupiedBy.etd ? fmtDT(b.occupiedBy.etd) : '—'}`}
            onClick={() => navigate(`/port-calls/${b.occupiedBy.callId}`)} />
        ) : (
          b.status === 'OPERATIONAL' && (
            <g>
              <rect x={(SLOT_W - 64) / 2} y={13} width="64" height="18" rx="9" fill="none" stroke={free} strokeDasharray="4 3" />
              <text x={SLOT_W / 2} y={25.5} textAnchor="middle" fontSize="9" fill={free} fontFamily="IBM Plex Mono, monospace">FREE</text>
            </g>
          )
        )}
      </g>
    );
  };

  return (
    <>
      <PageHeader
        icon={SpaceDashboardRoundedIcon} iconColor="#0797A5" title="Quay view — live 2-D twin"
        sub={`${occupied} of ${data.berths.length} berths occupied · ${data.anchorage.length} at anchorage · ${data.inbound.length} inbound — refreshes every minute`}
        actions={<Button size="small" startIcon={<RefreshRoundedIcon />} onClick={load}>Refresh</Button>}
      />
      <Card sx={{ p: 1.5 }}>
        <Box sx={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${layout.width} ${H}`} style={{ width: '100%', minWidth: 1180, display: 'block', borderRadius: 8 }}>
            <defs>
              <pattern id="maint" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
                <rect width="8" height="8" fill={quay} />
                <line x1="0" y1="0" x2="0" y2="8" stroke={dark ? '#E8B155' : '#9C6412'} strokeWidth="3" />
              </pattern>
            </defs>
            <rect width={layout.width} height={H} fill={sea} />
            <rect y={ROW_Y[2] - 60} width={layout.width} height={H - ROW_Y[2] + 60} fill={seaDeep} />
            {/* land banner behind each quay row */}
            {[0, 1].map((r) => (
              <rect key={r} y={ROW_Y[r] - QUAY_H - 62} width={layout.width} height={36} fill={apron} opacity="0.001" />
            ))}
            {/* terminal groups */}
            {layout.rows[0].map((g) => (
              <g key={g.terminal}>
                <text x={g.x + 2} y={ROW_Y[0] - QUAY_H - 48} fontSize="12" fontWeight="800" fill={ink} fontFamily="Archivo, sans-serif">{g.terminal.toUpperCase()}</text>
                {g.berths.map((b, i) => berthSlot(b, g.x + 8 + i * (SLOT_W + SLOT_GAP), ROW_Y[0]))}
              </g>
            ))}
            {layout.rows[1].map((g) => (
              <g key={g.terminal}>
                <text x={g.x + 2} y={ROW_Y[1] - QUAY_H - 48} fontSize="12" fontWeight="800" fill={ink} fontFamily="Archivo, sans-serif">{g.terminal.toUpperCase()}</text>
                {g.berths.map((b, i) => berthSlot(b, g.x + 8 + i * (SLOT_W + SLOT_GAP), ROW_Y[1]))}
              </g>
            ))}
            {/* offshore band: SPMs, anchorage, inbound */}
            <text x="26" y={ROW_Y[2] - 34} fontSize="12" fontWeight="800" fill={ink} fontFamily="Archivo, sans-serif">OFFSHORE — SPM · ANCHORAGE · APPROACHES</text>
            {layout.rows[2].flatMap((g) => g.berths).map((b, i) => (
              <g key={b.code} transform={`translate(${60 + i * 190},${ROW_Y[2] + 30})`}>
                <circle r="16" fill="none" stroke={dark ? '#E8B155' : '#9C6412'} strokeWidth="2.5" strokeDasharray="4 3" />
                <circle r="4" fill={dark ? '#E8B155' : '#9C6412'} />
                <text x="0" y="34" textAnchor="middle" fontSize="10" fill={ink} fontFamily="IBM Plex Mono, monospace">{b.code}</text>
                {b.occupiedBy && (
                  <Ship x={24} y={-SHIP_H / 2} w={92} color={shipColor(b.occupiedBy.type)} dark={dark}
                    label={b.occupiedBy.vessel?.replace(/^M[VT] /, '').split(' ')[0]}
                    title={`${b.occupiedBy.vessel} · ${b.occupiedBy.vcn}\n${b.occupiedBy.cargo || 'crude transfer'}`}
                    onClick={() => navigate(`/port-calls/${b.occupiedBy.callId}`)} />
                )}
              </g>
            ))}
            {/* anchorage box */}
            <g transform={`translate(${Math.max(480, layout.width * 0.34)},${ROW_Y[2] - 6})`}>
              <rect width="420" height="150" rx="10" fill="none" stroke={ink} strokeDasharray="6 5" strokeWidth="1.6" opacity="0.7" />
              <text x="10" y="-8" fontSize="10.5" fill={ink} fontFamily="IBM Plex Mono, monospace">ANCHORAGE A1 — AWAITING BERTH</text>
              {data.anchorage.map((a, i) => (
                <g key={a.callId} transform={`translate(${16 + (i % 3) * 136},${18 + Math.floor(i / 3) * 46})`}>
                  <Ship x={0} y={0} w={104} color={shipColor(a.type)} dark={dark}
                    label={a.vessel?.replace(/^M[VT] /, '').split(' ')[0]}
                    title={`${a.vessel} · ${a.vcn}\nAt anchor since ${fromNow(a.since)}\nETB ${a.etb ? fmtDT(a.etb) : '—'}`}
                    onClick={() => navigate(`/port-calls/${a.callId}`)} />
                </g>
              ))}
            </g>
            {/* inbound lane */}
            <g transform={`translate(${Math.max(960, layout.width * 0.66)},${ROW_Y[2] - 6})`}>
              <text x="10" y="-8" fontSize="10.5" fill={ink} fontFamily="IBM Plex Mono, monospace">INBOUND — NEXT ARRIVALS</text>
              {data.inbound.slice(0, 5).map((a, i) => (
                <g key={a.callId} transform={`translate(10,${14 + i * 30})`}>
                  <path d="M0,7 L10,0 L10,14 Z" fill={shipColor(a.type)} />
                  <text x="18" y="11" fontSize="11" fontWeight="700" fill={dark ? '#DCE7EA' : '#22404F'} fontFamily="Public Sans, sans-serif"
                    style={{ cursor: 'pointer' }} onClick={() => navigate(`/port-calls/${a.callId}`)}>
                    {a.vessel}
                  </text>
                  <text x="230" y="11" fontSize="10" fill={ink} fontFamily="IBM Plex Mono, monospace">ETA {a.eta ? fmtDT(a.eta).slice(0, 12) : '—'}</text>
                </g>
              ))}
              {data.inbound.length === 0 && <text x="18" y="24" fontSize="11" fill={ink}>None expected in the window</text>}
            </g>
          </svg>
        </Box>
        <Divider sx={{ my: 1.25 }} />
        <Stack direction="row" spacing={1.5} sx={{ px: 0.5, flexWrap: 'wrap', alignItems: 'center' }} useFlexGap>
          {[['container', 'Container'], ['dryBulk', 'Dry bulk / coal'], ['liquid', 'Liquid / crude'], ['other', 'General · Ro-Ro']].map(([k, label]) => (
            <Stack key={k} direction="row" spacing={0.6} alignItems="center">
              <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: C[k] }} />
              <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Stack>
          ))}
          <Chip size="small" variant="outlined" label="Ship length drawn to scale against its berth" sx={{ fontSize: 10.5 }} />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto !important' }}>
            Schematic representation for operations — not for navigation
          </Typography>
        </Stack>
      </Card>
    </>
  );
}
