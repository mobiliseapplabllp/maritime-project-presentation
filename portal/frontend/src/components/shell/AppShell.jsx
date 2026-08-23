import { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography, Divider,
  AppBar, Toolbar, IconButton, Badge, Menu, MenuItem, ListSubheader, Chip, Avatar,
  Popover, ListItem, ListItemAvatar, Tooltip, useMediaQuery, Dialog, Grow, ButtonBase, Fade,
} from '@mui/material';
import AppsRoundedIcon from '@mui/icons-material/AppsRounded';
import AnchorRoundedIcon from '@mui/icons-material/AnchorRounded';
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import api from '../../api/client';
import { hasPerm } from '../../utils/perms';
import { toggleMode } from '../../store/uiSlice';
import { clearSession } from '../../store/authSlice';
import { fromNow } from '../../utils/format';
import { ADANI_GRADIENT } from '../../theme';
import { MODULES, moduleOf } from '../../modules';
import { GlobalProgress, PageLoader } from '../common/Loaders';
import AiDock from './AiDock';

const W = 236;
const SEVERITY_COLOR = { info: 'info.main', success: 'success.main', warning: 'warning.main', error: 'error.main' };

function Bell() {
  const [anchor, setAnchor] = useState(null);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();
  const load = () => api.get('/notifications')
    .then((r) => { setItems(r.data); setUnread(r.meta?.unread || 0); }).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  return (
    <>
      <Tooltip title="Notifications">
        <IconButton color="inherit" onClick={(e) => setAnchor(e.currentTarget)}>
          <Badge badgeContent={unread} color="error"><NotificationsRoundedIcon /></Badge>
        </IconButton>
      </Tooltip>
      <Popover open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 380, maxHeight: 440 } } }}>
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
              <ListItemText primary={n.title} secondary={`${n.body || ''} · ${fromNow(n.createdAt)}`}
                primaryTypographyProps={{ fontWeight: n.read ? 400 : 600, fontSize: 13.5 }}
                secondaryTypographyProps={{ fontSize: 12 }} />
            </ListItemButton>
          ))}
        </List>
      </Popover>
    </>
  );
}

function Launcher({ open, onClose, user }) {
  const navigate = useNavigate();
  const visible = MODULES.filter((m) => hasPerm(user, m.perm));
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth TransitionComponent={Grow}
      slotProps={{ backdrop: { sx: { backdropFilter: 'blur(5px)' } }, paper: { sx: { borderRadius: 4, p: 1 } } }}>
      <Box sx={{ px: 3, pt: 2.5, pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6">Applications</Typography>
          <Typography variant="caption" color="text.secondary">
            {visible.length} modules available to {user?.role?.name}
          </Typography>
        </Box>
        <IconButton onClick={onClose}><CloseRoundedIcon /></IconButton>
      </Box>
      <Box sx={{ p: 2.5, pt: 1.5, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 1.5 }}>
        {visible.map((m) => {
          const Icon = m.icon;
          return (
            <ButtonBase key={m.key} onClick={() => { onClose(); navigate(m.home); }}
              sx={{
                borderRadius: 3, p: 2, textAlign: 'left', alignItems: 'flex-start', flexDirection: 'column', gap: 1.25,
                border: 1, borderColor: 'divider', transition: 'all .15s',
                '&:hover': { borderColor: m.color, transform: 'translateY(-2px)', boxShadow: 3 },
              }}>
              <Box sx={{ width: 42, height: 42, borderRadius: '12px', display: 'grid', placeItems: 'center', bgcolor: m.color, color: '#fff' }}>
                <Icon sx={{ fontSize: 23 }} />
              </Box>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 14.5 }}>{m.name}</Typography>
                <Typography sx={{ fontSize: 11.8, color: 'text.secondary', lineHeight: 1.35, mt: 0.25 }}>{m.desc}</Typography>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
    </Dialog>
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
  const [launcher, setLauncher] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const wide = useMediaQuery('(min-width:1000px)');

  const activeModule = moduleOf(location.pathname);
  const prevModule = useRef(activeModule.key);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (prevModule.current !== activeModule.key) {
      prevModule.current = activeModule.key;
      setSwitching(true);
      const t = setTimeout(() => setSwitching(false), 520);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [activeModule.key]);

  const ActiveIcon = activeModule.icon;

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: mode === 'dark' ? '#071A2E' : '#0A2239', color: '#D8E4EE' }}>
      <Box sx={{ px: 2.25, py: 2, display: 'flex', gap: 1.25, alignItems: 'center' }}>
        <Box sx={{ width: 34, height: 34, borderRadius: '9px', background: ADANI_GRADIENT, display: 'grid', placeItems: 'center' }}>
          <AnchorRoundedIcon sx={{ fontSize: 20, color: '#fff' }} />
        </Box>
        <Box>
          <Typography sx={{ fontFamily: 'Archivo', fontWeight: 800, fontSize: 15, lineHeight: 1.1, color: '#fff' }}>Mundra Port</Typography>
          <Typography sx={{ fontFamily: '"IBM Plex Mono",monospace', fontSize: 9.5, letterSpacing: '0.14em', color: '#7C9BB5' }}>OPERATIONS · INMUN</Typography>
        </Box>
      </Box>
      <Box sx={{ mx: 1.5, mb: 1, p: 1.25, borderRadius: 2.5, bgcolor: 'rgba(255,255,255,0.055)', display: 'flex', gap: 1.25, alignItems: 'center' }}>
        <Box sx={{ width: 30, height: 30, borderRadius: '8px', bgcolor: activeModule.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <ActiveIcon sx={{ fontSize: 17, color: '#fff' }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{activeModule.name}</Typography>
          <Typography noWrap sx={{ fontSize: 10, color: '#7C9BB5' }}>Active module</Typography>
        </Box>
      </Box>
      <List sx={{ flex: 1, overflowY: 'auto', px: 1, py: 0.5 }} dense>
        {activeModule.nav.map((group) => (
          <Box key={group.header}>
            {group.items.some((i) => hasPerm(user, i.perm)) && (
              <ListSubheader disableSticky sx={{ bgcolor: 'transparent', color: '#5B7C99', fontFamily: '"IBM Plex Mono",monospace', fontSize: 9.5, letterSpacing: '0.15em', textTransform: 'uppercase', lineHeight: '30px' }}>
                {group.header}
              </ListSubheader>
            )}
            {group.items.filter((i) => hasPerm(user, i.perm)).map((item) => {
              const ItemIcon = item.icon;
              return (
                <ListItemButton key={item.to} component={NavLink} to={item.to} end={item.end}
                  sx={{
                    borderRadius: '8px', mb: 0.25, color: '#B7C9DA', minHeight: 38,
                    '& .MuiListItemIcon-root': { color: '#7C9BB5', minWidth: 34 },
                    '&.active': { bgcolor: 'rgba(11,116,176,0.32)', color: '#fff', '& .MuiListItemIcon-root': { color: '#6EC1EF' } },
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
                  }}>
                  <ListItemIcon sx={{ '& svg': { fontSize: 19 } }}><ItemIcon /></ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 13.5, fontWeight: 600 }} />
                </ListItemButton>
              );
            })}
          </Box>
        ))}
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 1 }} />
        <ListItemButton onClick={() => setLauncher(true)}
          sx={{ borderRadius: '8px', color: '#B7C9DA', '& .MuiListItemIcon-root': { color: '#7C9BB5', minWidth: 34 }, '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' } }}>
          <ListItemIcon><AppsRoundedIcon sx={{ fontSize: 19 }} /></ListItemIcon>
          <ListItemText primary="All applications" primaryTypographyProps={{ fontSize: 13.5, fontWeight: 600 }} />
        </ListItemButton>
      </List>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
      <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Avatar sx={{ width: 32, height: 32, background: ADANI_GRADIENT, fontSize: 14, fontWeight: 700 }}>
          {user?.name?.split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{user?.name}</Typography>
          <Typography noWrap sx={{ fontSize: 11, color: '#7C9BB5' }}>{user?.role?.name}</Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer variant={wide ? 'permanent' : 'temporary'} open={wide ? true : mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{ width: W, flexShrink: 0, '& .MuiDrawer-paper': { width: W, border: 0 } }}>
        {drawer}
      </Drawer>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <AppBar position="sticky" elevation={0} color="transparent"
          sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
          <Toolbar variant="dense" sx={{ minHeight: 54, gap: 0.75 }}>
            {!wide && <IconButton edge="start" onClick={() => setMobileOpen(true)}><MenuRoundedIcon /></IconButton>}
            <Tooltip title="All applications">
              <IconButton onClick={() => setLauncher(true)} sx={{ borderRadius: 2 }}>
                <AppsRoundedIcon />
              </IconButton>
            </Tooltip>
            <Chip size="small" label={activeModule.name} sx={{ bgcolor: activeModule.color, color: '#fff', fontWeight: 700, fontSize: 11, display: { xs: 'none', sm: 'inline-flex' } }} />
            <Box sx={{ flex: 1 }} />
            <Chip size="small" label={import.meta.env.VITE_DEMO === '1' ? 'READ-ONLY DEMO' : 'DEMO DATA'} color="warning" variant="outlined"
              sx={{ fontSize: 10, fontWeight: 700, display: { xs: 'none', md: 'inline-flex' } }} />
            {hasPerm(user, 'ai.use') && (
              <Tooltip title="AI assistant">
                <IconButton onClick={() => setAiOpen(true)}
                  sx={{ background: ADANI_GRADIENT, color: '#fff', width: 34, height: 34, borderRadius: 2.5, '&:hover': { opacity: 0.88, background: ADANI_GRADIENT } }}>
                  <AutoAwesomeRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
              <IconButton color="inherit" onClick={() => dispatch(toggleMode())}>
                {mode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
              </IconButton>
            </Tooltip>
            <Bell />
            <IconButton onClick={(e) => setUserMenu(e.currentTarget)} sx={{ p: 0.5 }}>
              <Avatar sx={{ width: 30, height: 30, background: ADANI_GRADIENT, fontSize: 13, fontWeight: 700 }}>
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
          <GlobalProgress />
        </AppBar>
        <Box component="main" sx={{ flex: 1, p: { xs: 2, md: 3 }, maxWidth: 1480, width: '100%', mx: 'auto' }}>
          {switching ? <PageLoader label={`Opening ${activeModule.name}…`} /> : (
            <Fade in timeout={250}><Box><Outlet /></Box></Fade>
          )}
        </Box>
      </Box>
      <Launcher open={launcher} onClose={() => setLauncher(false)} user={user} />
      <AiDock open={aiOpen} onClose={() => setAiOpen(false)} />
    </Box>
  );
}
