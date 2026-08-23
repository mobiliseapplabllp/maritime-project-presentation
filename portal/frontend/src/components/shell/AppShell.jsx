import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography, Divider,
  AppBar, Toolbar, IconButton, Badge, Menu, MenuItem, ListSubheader, Chip, Avatar,
  Popover, ListItem, ListItemAvatar, Tooltip, useMediaQuery,
} from '@mui/material';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import DirectionsBoatFilledRoundedIcon from '@mui/icons-material/DirectionsBoatFilledRounded';
import AnchorRoundedIcon from '@mui/icons-material/AnchorRounded';
import ViewTimelineRoundedIcon from '@mui/icons-material/ViewTimelineRounded';
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import PriceChangeRoundedIcon from '@mui/icons-material/PriceChangeRounded';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import api from '../../api/client';
import { hasPerm } from '../../utils/perms';
import { toggleMode } from '../../store/uiSlice';
import { clearSession } from '../../store/authSlice';
import { fromNow } from '../../utils/format';

const W = 236;

const NAV = [
  { header: 'Operations' },
  { to: '/', label: 'Dashboard', icon: <DashboardRoundedIcon />, perm: 'dashboard.view', end: true },
  { to: '/port-calls', label: 'Port Calls', icon: <ViewTimelineRoundedIcon />, perm: 'portcalls.view' },
  { to: '/berth-board', label: 'Berth Board', icon: <AnchorRoundedIcon />, perm: 'portcalls.view' },
  { header: 'Registry & Compliance' },
  { to: '/vessels', label: 'Vessels', icon: <DirectionsBoatFilledRoundedIcon />, perm: 'vessels.view' },
  { to: '/certificates', label: 'Certificates', icon: <WorkspacePremiumRoundedIcon />, perm: 'certificates.view' },
  { to: '/inspections', label: 'Inspections', icon: <FactCheckRoundedIcon />, perm: 'inspections.view' },
  { header: 'Finance' },
  { to: '/invoices', label: 'Invoices', icon: <ReceiptLongRoundedIcon />, perm: 'invoices.view' },
  { to: '/masters/tariffs', label: 'Tariffs', icon: <PriceChangeRoundedIcon />, perm: 'tariffs.view' },
  { header: 'Masters' },
  { to: '/masters/berths', label: 'Berths & Terminals', icon: <HubRoundedIcon />, perm: 'masters.view' },
  { to: '/masters/lookups', label: 'Lookups', icon: <ListAltRoundedIcon />, perm: 'masters.view' },
  { to: '/masters/checklists', label: 'Checklist Templates', icon: <ChecklistRoundedIcon />, perm: 'masters.view' },
  { header: 'Administration' },
  { to: '/admin/users', label: 'Users', icon: <GroupRoundedIcon />, perm: 'users.view' },
  { to: '/admin/roles', label: 'Roles & Permissions', icon: <AdminPanelSettingsRoundedIcon />, perm: 'roles.view' },
  { to: '/admin/audit', label: 'Audit Log', icon: <HistoryRoundedIcon />, perm: 'audit.view' },
  { to: '/admin/settings', label: 'Settings', icon: <SettingsRoundedIcon />, perm: 'settings.view' },
];

const SEVERITY_COLOR = { info: 'info.main', success: 'success.main', warning: 'warning.main', error: 'error.main' };

function Bell() {
  const [anchor, setAnchor] = useState(null);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();

  const load = () => api.get('/notifications')
    .then((r) => { setItems(r.data); setUnread(r.meta?.unread || 0); })
    .catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton color="inherit" onClick={(e) => setAnchor(e.currentTarget)}>
          <Badge badgeContent={unread} color="error"><NotificationsRoundedIcon /></Badge>
        </IconButton>
      </Tooltip>
      <Popover
        open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 380, maxHeight: 440 } } }}
      >
        <Box sx={{ px: 2, py: 1.25, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle2">Notifications</Typography>
          {unread > 0 && (
            <Typography variant="caption" sx={{ cursor: 'pointer', color: 'primary.main', fontWeight: 600 }}
              onClick={() => api.post('/notifications/read-all').then(load)}>Mark all read</Typography>
          )}
        </Box>
        <Divider />
        <List dense disablePadding>
          {items.length === 0 && <ListItem><ListItemText primary="Nothing here yet" primaryTypographyProps={{ color: 'text.secondary' }} /></ListItem>}
          {items.map((n) => (
            <ListItemButton key={n._id} alignItems="flex-start" sx={{ opacity: n.read ? 0.62 : 1 }}
              onClick={() => { api.post(`/notifications/${n._id}/read`).then(load); if (n.link) { navigate(n.link); setAnchor(null); } }}>
              <ListItemAvatar sx={{ minWidth: 30, mt: 1 }}>
                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: SEVERITY_COLOR[n.severity] || 'info.main' }} />
              </ListItemAvatar>
              <ListItemText
                primary={n.title} secondary={`${n.body || ''} · ${fromNow(n.createdAt)}`}
                primaryTypographyProps={{ fontWeight: n.read ? 400 : 600, fontSize: 13.5 }}
                secondaryTypographyProps={{ fontSize: 12 }}
              />
            </ListItemButton>
          ))}
        </List>
      </Popover>
    </>
  );
}

export default function AppShell() {
  const user = useSelector((s) => s.auth.user);
  const mode = useSelector((s) => s.ui.mode);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [userMenu, setUserMenu] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const wide = useMediaQuery('(min-width:1000px)');
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: mode === 'dark' ? '#081B26' : '#0B1F2A', color: '#DCE7EA' }}>
      <Box sx={{ px: 2.25, py: 2, display: 'flex', gap: 1.25, alignItems: 'center' }}>
        <Box sx={{ width: 34, height: 34, borderRadius: '9px', bgcolor: '#0E7C86', display: 'grid', placeItems: 'center' }}>
          <AnchorRoundedIcon sx={{ fontSize: 20, color: '#fff' }} />
        </Box>
        <Box>
          <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 15, lineHeight: 1.1, color: '#fff' }}>Mundra Port</Typography>
          <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 9.5, letterSpacing: '0.14em', color: '#7FA0AC' }}>OPERATIONS · INMUN</Typography>
        </Box>
      </Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
      <List sx={{ flex: 1, overflowY: 'auto', px: 1, py: 0.5 }} dense>
        {NAV.map((item, i) => {
          if (item.header) {
            const next = NAV.slice(i + 1, NAV.findIndex((x, j) => j > i && x.header) === -1 ? undefined : NAV.findIndex((x, j) => j > i && x.header));
            if (!next.some((x) => hasPerm(user, x.perm))) return null;
            return (
              <ListSubheader key={item.header} disableSticky sx={{ bgcolor: 'transparent', color: '#5F8291', fontFamily: '"IBM Plex Mono",monospace', fontSize: 9.5, letterSpacing: '0.15em', textTransform: 'uppercase', lineHeight: '30px', mt: 0.5 }}>
                {item.header}
              </ListSubheader>
            );
          }
          if (!hasPerm(user, item.perm)) return null;
          return (
            <ListItemButton
              key={item.to} component={NavLink} to={item.to} end={item.end}
              sx={{
                borderRadius: '8px', mb: 0.25, color: '#B9CCD3', minHeight: 36,
                '& .MuiListItemIcon-root': { color: '#7FA0AC', minWidth: 34 },
                '&.active': { bgcolor: 'rgba(14,124,134,0.28)', color: '#fff', '& .MuiListItemIcon-root': { color: '#5FD0D8' } },
                '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
              }}
            >
              <ListItemIcon sx={{ '& svg': { fontSize: 19 } }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: 600 }} />
            </ListItemButton>
          );
        })}
      </List>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Avatar sx={{ width: 32, height: 32, bgcolor: '#0E7C86', fontSize: 14, fontWeight: 700 }}>
          {user?.name?.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{user?.name}</Typography>
          <Typography noWrap sx={{ fontSize: 11, color: '#7FA0AC' }}>{user?.role?.name}</Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant={wide ? 'permanent' : 'temporary'} open={wide ? true : mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{ width: W, flexShrink: 0, '& .MuiDrawer-paper': { width: W, border: 0 } }}
      >
        {drawer}
      </Drawer>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar position="sticky" elevation={0} color="transparent"
          sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', backdropFilter: 'blur(6px)' }}>
          <Toolbar variant="dense" sx={{ minHeight: 52, gap: 1 }}>
            {!wide && <IconButton edge="start" onClick={() => setMobileOpen(true)}><MenuRoundedIcon /></IconButton>}
            <Chip size="small" label="Adani Mundra Port · IN MUN" variant="outlined"
              sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 11, letterSpacing: '0.05em' }} />
            <Chip size="small" label="DEMO DATA" color="warning" variant="outlined" sx={{ fontSize: 10, fontWeight: 700 }} />
            <Box sx={{ flex: 1 }} />
            <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
              <IconButton color="inherit" onClick={() => dispatch(toggleMode())}>
                {mode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
              </IconButton>
            </Tooltip>
            <Bell />
            <IconButton onClick={(e) => setUserMenu(e.currentTarget)} sx={{ p: 0.5 }}>
              <Avatar sx={{ width: 30, height: 30, bgcolor: 'primary.main', fontSize: 13, fontWeight: 700 }}>
                {user?.name?.split(' ').map((w) => w[0]).slice(0, 2).join('')}
              </Avatar>
            </IconButton>
            <Menu anchorEl={userMenu} open={!!userMenu} onClose={() => setUserMenu(null)}>
              <MenuItem onClick={() => { setUserMenu(null); navigate('/profile'); }}>
                <ListItemIcon><PersonRoundedIcon fontSize="small" /></ListItemIcon>My profile
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => { setUserMenu(null); dispatch(clearSession()); }}>
                <ListItemIcon><LogoutRoundedIcon fontSize="small" /></ListItemIcon>Sign out
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ flex: 1, p: { xs: 2, md: 3 }, maxWidth: 1440, width: '100%', mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
