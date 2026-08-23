import { useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Snackbar, Alert } from '@mui/material';
import { buildTheme } from './theme';
import { clearSnackbar } from './store/uiSlice';
import { hasPerm } from './utils/perms';
import AppShell from './components/shell/AppShell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PortCallsList from './pages/portcalls/PortCallsList';
import PortCallDetail from './pages/portcalls/PortCallDetail';
import BerthBoard from './pages/BerthBoard';
import VesselsList from './pages/vessels/VesselsList';
import VesselDetail from './pages/vessels/VesselDetail';
import CertificatesPage from './pages/CertificatesPage';
import InspectionsList from './pages/inspections/InspectionsList';
import InspectionDetail from './pages/inspections/InspectionDetail';
import InvoicesList from './pages/invoices/InvoicesList';
import InvoiceDetail from './pages/invoices/InvoiceDetail';
import BerthsPage from './pages/masters/BerthsPage';
import LookupsPage from './pages/masters/LookupsPage';
import TariffsPage from './pages/masters/TariffsPage';
import ChecklistsPage from './pages/masters/ChecklistsPage';
import UsersPage from './pages/admin/UsersPage';
import RolesPage from './pages/admin/RolesPage';
import AuditPage from './pages/admin/AuditPage';
import SettingsPage from './pages/admin/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import { StatePage } from './components/common/StatePage';

function Guard({ perm, children }) {
  const user = useSelector((s) => s.auth.user);
  if (!user) return <Navigate to="/login" replace />;
  if (perm && !hasPerm(user, perm)) {
    return <StatePage code="403" title="No access" message={`Your role (${user.role?.name}) doesn't include this area.`} />;
  }
  return children;
}

export default function App() {
  const mode = useSelector((s) => s.ui.mode);
  const snackbar = useSelector((s) => s.ui.snackbar);
  const user = useSelector((s) => s.auth.user);
  const dispatch = useDispatch();
  const location = useLocation();
  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route element={user ? <AppShell /> : <Navigate to="/login" replace state={{ from: location }} />}>
          <Route path="/" element={<Guard perm="dashboard.view"><Dashboard /></Guard>} />
          <Route path="/port-calls" element={<Guard perm="portcalls.view"><PortCallsList /></Guard>} />
          <Route path="/port-calls/:id" element={<Guard perm="portcalls.view"><PortCallDetail /></Guard>} />
          <Route path="/berth-board" element={<Guard perm="portcalls.view"><BerthBoard /></Guard>} />
          <Route path="/vessels" element={<Guard perm="vessels.view"><VesselsList /></Guard>} />
          <Route path="/vessels/:id" element={<Guard perm="vessels.view"><VesselDetail /></Guard>} />
          <Route path="/certificates" element={<Guard perm="certificates.view"><CertificatesPage /></Guard>} />
          <Route path="/inspections" element={<Guard perm="inspections.view"><InspectionsList /></Guard>} />
          <Route path="/inspections/:id" element={<Guard perm="inspections.view"><InspectionDetail /></Guard>} />
          <Route path="/invoices" element={<Guard perm="invoices.view"><InvoicesList /></Guard>} />
          <Route path="/invoices/:id" element={<Guard perm="invoices.view"><InvoiceDetail /></Guard>} />
          <Route path="/masters/berths" element={<Guard perm="masters.view"><BerthsPage /></Guard>} />
          <Route path="/masters/lookups" element={<Guard perm="masters.view"><LookupsPage /></Guard>} />
          <Route path="/masters/tariffs" element={<Guard perm="tariffs.view"><TariffsPage /></Guard>} />
          <Route path="/masters/checklists" element={<Guard perm="masters.view"><ChecklistsPage /></Guard>} />
          <Route path="/admin/users" element={<Guard perm="users.view"><UsersPage /></Guard>} />
          <Route path="/admin/roles" element={<Guard perm="roles.view"><RolesPage /></Guard>} />
          <Route path="/admin/audit" element={<Guard perm="audit.view"><AuditPage /></Guard>} />
          <Route path="/admin/settings" element={<Guard perm="settings.view"><SettingsPage /></Guard>} />
          <Route path="/profile" element={<Guard><ProfilePage /></Guard>} />
          <Route path="*" element={<StatePage code="404" title="Page not found" message="The page you're looking for doesn't exist." />} />
        </Route>
      </Routes>
      <Snackbar
        open={!!snackbar} autoHideDuration={3500}
        onClose={() => dispatch(clearSnackbar())}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? <Alert severity={snackbar.severity || 'success'} variant="filled" onClose={() => dispatch(clearSnackbar())}>{snackbar.message}</Alert> : <span />}
      </Snackbar>
    </ThemeProvider>
  );
}
