import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Grid, Card, Box, Typography, ButtonBase, Chip, Stack, Skeleton } from '@mui/material';
import LibraryBooksRoundedIcon from '@mui/icons-material/LibraryBooksRounded';
import AnchorRoundedIcon from '@mui/icons-material/AnchorRounded';
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded';
import ViewTimelineRoundedIcon from '@mui/icons-material/ViewTimelineRounded';
import HourglassBottomRoundedIcon from '@mui/icons-material/HourglassBottomRounded';
import DirectionsBoatRoundedIcon from '@mui/icons-material/DirectionsBoatRounded';
import DirectionsBoatFilledRoundedIcon from '@mui/icons-material/DirectionsBoatFilledRounded';
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded';
import BadgeRoundedIcon from '@mui/icons-material/BadgeRounded';
import GavelRoundedIcon from '@mui/icons-material/GavelRounded';
import CrisisAlertRoundedIcon from '@mui/icons-material/CrisisAlertRounded';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import CorporateFareRoundedIcon from '@mui/icons-material/CorporateFareRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import PriceChangeRoundedIcon from '@mui/icons-material/PriceChangeRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import api from '../../api/client';
import PageHeader from '../../components/common/PageHeader';
import { MODULES } from '../../modules';

/* The pre-seeded report library — every operational report across modules,
 * run on demand in the viewer with Excel / PDF / print export. */

const ICONS = {
  Anchor: AnchorRoundedIcon, EventNote: EventNoteRoundedIcon, ViewTimeline: ViewTimelineRoundedIcon,
  HourglassBottom: HourglassBottomRoundedIcon, DirectionsBoat: DirectionsBoatRoundedIcon,
  DirectionsBoatFilled: DirectionsBoatFilledRoundedIcon, WorkspacePremium: WorkspacePremiumRoundedIcon,
  Badge: BadgeRoundedIcon, Gavel: GavelRoundedIcon, CrisisAlert: CrisisAlertRoundedIcon,
  MonitorHeart: MonitorHeartRoundedIcon, FactCheck: FactCheckRoundedIcon, Block: BlockRoundedIcon,
  Checklist: ChecklistRoundedIcon, CorporateFare: CorporateFareRoundedIcon, ReceiptLong: ReceiptLongRoundedIcon,
  Payments: PaymentsRoundedIcon, PriceChange: PriceChangeRoundedIcon, AdminPanelSettings: AdminPanelSettingsRoundedIcon,
};
const iconOf = (name) => ICONS[name] || DescriptionRoundedIcon;

export default function ReportLibrary() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);

  useEffect(() => { api.get('/reports/catalog').then((r) => setCatalog(r.data)).catch(() => setCatalog([])); }, []);

  const moduleName = (key) => MODULES.find((m) => m.key === key)?.name || key;
  const moduleColor = (key) => MODULES.find((m) => m.key === key)?.color || '#5A6B78';
  const groups = catalog ? [...new Set(catalog.map((c) => c.module))] : [];

  return (
    <>
      <PageHeader
        icon={LibraryBooksRoundedIcon} iconColor="#0B5D8A"
        title="Report library" sub="Pre-seeded operational reports from every module — run, print, export to Excel or PDF"
      />
      {!catalog && <Grid container spacing={1.5}>{Array.from({ length: 8 }).map((_, i) => <Grid item xs={12} md={3} key={i}><Skeleton variant="rounded" height={110} /></Grid>)}</Grid>}
      {catalog && groups.map((g) => (
        <Box key={g} sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: moduleColor(g) }} />
            <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'text.secondary' }}>
              {moduleName(g)}
            </Typography>
          </Stack>
          <Grid container spacing={1.5}>
            {catalog.filter((c) => c.module === g).map((rep) => {
              const Icon = iconOf(rep.icon);
              return (
                <Grid item xs={12} sm={6} md={4} lg={3} key={rep.key}>
                  <ButtonBase onClick={() => navigate(`/reports/view/${rep.key}`)} sx={{ width: '100%', textAlign: 'left', borderRadius: 3, height: '100%' }}>
                    <Card variant="outlined" sx={{ p: 1.75, width: '100%', height: '100%', display: 'flex', gap: 1.5, alignItems: 'flex-start',
                      transition: 'all .15s', '&:hover': { borderColor: moduleColor(g), transform: 'translateY(-2px)', boxShadow: 3 } }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: '11px', display: 'grid', placeItems: 'center', bgcolor: moduleColor(g), color: '#fff', flexShrink: 0 }}>
                        <Icon sx={{ fontSize: 22 }} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.3 }}>{rep.name}</Typography>
                        <Typography sx={{ fontSize: 11.5, color: 'text.secondary', lineHeight: 1.4, mt: 0.4 }}>{rep.desc}</Typography>
                      </Box>
                    </Card>
                  </ButtonBase>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      ))}
      {catalog && (
        <Chip size="small" variant="outlined" label={`${catalog.length} pre-seeded reports — module settings control formats and periods`} sx={{ fontSize: 11 }} />
      )}
    </>
  );
}
