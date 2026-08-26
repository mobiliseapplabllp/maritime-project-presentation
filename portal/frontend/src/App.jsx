import { useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Snackbar, Alert } from '@mui/material';
import { buildTheme } from './theme';
import { clearSnackbar } from './store/uiSlice';
import { hasPerm } from './utils/perms';
import AppShell from './components/shell/AppShell';
import { PageLoader } from './components/common/Loaders';
import { lazy, Suspense } from 'react';
const Login = lazy(() => import('./pages/Login'));
const VerifyLicense = lazy(() => import('./pages/public/VerifyLicense'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const PortCallsList = lazy(() => import('./pages/portcalls/PortCallsList'));
const PortCallDetail = lazy(() => import('./pages/portcalls/PortCallDetail'));
const BerthBoard = lazy(() => import('./pages/BerthBoard'));
const BerthPlanner = lazy(() => import('./pages/ops/BerthPlanner'));
const VesselsList = lazy(() => import('./pages/vessels/VesselsList'));
const VesselDetail = lazy(() => import('./pages/vessels/VesselDetail'));
const SurveyPlanner = lazy(() => import('./pages/vessels/SurveyPlanner'));
const CertificatesPage = lazy(() => import('./pages/CertificatesPage'));
const InspectionsList = lazy(() => import('./pages/inspections/InspectionsList'));
const InspectionDetail = lazy(() => import('./pages/inspections/InspectionDetail'));
const InvoicesList = lazy(() => import('./pages/invoices/InvoicesList'));
const InvoiceDetail = lazy(() => import('./pages/invoices/InvoiceDetail'));
const BerthsPage = lazy(() => import('./pages/masters/BerthsPage'));
const LookupsPage = lazy(() => import('./pages/masters/LookupsPage'));
const TariffsPage = lazy(() => import('./pages/masters/TariffsPage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const RolesPage = lazy(() => import('./pages/admin/RolesPage'));
const AuditPage = lazy(() => import('./pages/admin/AuditPage'));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SeafarersList = lazy(() => import('./pages/seafarers/SeafarersList'));
const CrewDashboard = lazy(() => import('./pages/seafarers/CrewDashboard'));
const SeafarerDetail = lazy(() => import('./pages/seafarers/SeafarerDetail'));
const LegislationPage = lazy(() => import('./pages/legislation/LegislationPage'));
const RegistrationsList = lazy(() => import('./pages/registry/RegistrationsList'));
const RegistrationDetail = lazy(() => import('./pages/registry/RegistrationDetail'));
const FacilitiesList = lazy(() => import('./pages/facilities/FacilitiesList'));
const FacilityDetail = lazy(() => import('./pages/facilities/FacilityDetail'));
const TrafficMap = lazy(() => import('./pages/nmc/TrafficMap'));
const IncidentDashboard = lazy(() => import('./pages/incidents/IncidentDashboard'));
const IncidentsRegister = lazy(() => import('./pages/incidents/IncidentsRegister'));
const IncidentCase = lazy(() => import('./pages/incidents/IncidentCase'));
const RiskMatrix = lazy(() => import('./pages/incidents/RiskMatrix'));
const FleetDashboard = lazy(() => import('./pages/vessels/FleetDashboard'));
const PortTwin = lazy(() => import('./pages/ops/PortTwin'));
const VesselSchedule = lazy(() => import('./pages/ops/VesselSchedule'));
const MarineServices = lazy(() => import('./pages/ops/MarineServices'));
const MastersHub = lazy(() => import('./pages/masters/MastersHub'));
const MasterPage = lazy(() => import('./pages/masters/MasterPage'));
const ReportLibrary = lazy(() => import('./pages/mis/ReportLibrary'));
const ReportViewer = lazy(() => import('./pages/mis/ReportViewer'));
const ChecklistBuilder = lazy(() => import('./pages/inspections/ChecklistBuilder'));
const AuditDashboard = lazy(() => import('./pages/inspections/AuditDashboard'));
const CompaniesPage = lazy(() => import('./pages/facilities/CompaniesPage'));
const CompanyDetail = lazy(() => import('./pages/facilities/CompanyDetail'));
const ModuleSettingsPage = lazy(() => import('./pages/ModuleSettingsPage'));
const RiskRegister = lazy(() => import('./pages/risk/RiskRegister'));
const TargetingPage = lazy(() => import('./pages/risk/TargetingPage'));
const MisReport = lazy(() => import('./pages/mis/MisReport'));
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
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/verify/:licenseNo" element={<VerifyLicense />} />
        <Route element={user ? <AppShell /> : <Navigate to="/login" replace state={{ from: location }} />}>
          <Route path="/" element={<Guard perm="dashboard.view"><Dashboard /></Guard>} />
          <Route path="/port-calls" element={<Guard perm="portcalls.view"><PortCallsList /></Guard>} />
          <Route path="/port-calls/:id" element={<Guard perm="portcalls.view"><PortCallDetail /></Guard>} />
          <Route path="/berth-board" element={<Guard perm="portcalls.view"><BerthBoard /></Guard>} />
          <Route path="/berth-planner" element={<Guard perm="portcalls.view"><BerthPlanner /></Guard>} />
          <Route path="/quay-view" element={<Guard perm="portcalls.view"><PortTwin /></Guard>} />
          <Route path="/schedule" element={<Guard perm="portcalls.view"><VesselSchedule /></Guard>} />
          <Route path="/marine-services" element={<Guard perm="portcalls.view"><MarineServices /></Guard>} />
          <Route path="/fleet" element={<Guard perm="vessels.view"><FleetDashboard /></Guard>} />
          <Route path="/vessels" element={<Guard perm="vessels.view"><VesselsList /></Guard>} />
          <Route path="/vessels/:id" element={<Guard perm="vessels.view"><VesselDetail /></Guard>} />
          <Route path="/vessels/survey-planner" element={<Guard perm="vessels.view"><SurveyPlanner /></Guard>} />
          <Route path="/certificates" element={<Guard perm="certificates.view"><CertificatesPage /></Guard>} />
          <Route path="/inspections/overview" element={<Guard perm="inspections.view"><AuditDashboard /></Guard>} />
          <Route path="/inspections" element={<Guard perm="inspections.view"><InspectionsList /></Guard>} />
          <Route path="/checklist-builder" element={<Guard perm="inspections.view"><ChecklistBuilder /></Guard>} />
          <Route path="/inspections/:id" element={<Guard perm="inspections.view"><InspectionDetail /></Guard>} />
          <Route path="/invoices" element={<Guard perm="invoices.view"><InvoicesList /></Guard>} />
          <Route path="/invoices/:id" element={<Guard perm="invoices.view"><InvoiceDetail /></Guard>} />
          <Route path="/masters" element={<Guard perm="masters.view"><MastersHub /></Guard>} />
          <Route path="/masters/m/:category" element={<Guard perm="masters.view"><MasterPage /></Guard>} />
          <Route path="/masters/berths" element={<Guard perm="masters.view"><BerthsPage /></Guard>} />
          <Route path="/masters/lookups" element={<Guard perm="masters.view"><LookupsPage /></Guard>} />
          <Route path="/masters/tariffs" element={<Guard perm="tariffs.view"><TariffsPage /></Guard>} />
          <Route path="/masters/checklists" element={<Navigate to="/checklist-builder" replace />} />
          <Route path="/admin/users" element={<Guard perm="users.view"><UsersPage /></Guard>} />
          <Route path="/admin/roles" element={<Guard perm="roles.view"><RolesPage /></Guard>} />
          <Route path="/admin/audit" element={<Guard perm="audit.view"><AuditPage /></Guard>} />
          <Route path="/admin/settings" element={<Guard perm="settings.view"><SettingsPage /></Guard>} />
          <Route path="/seafarers/overview" element={<Guard perm="seafarers.view"><CrewDashboard /></Guard>} />
          <Route path="/seafarers" element={<Guard perm="seafarers.view"><SeafarersList /></Guard>} />
          <Route path="/seafarers/:id" element={<Guard perm="seafarers.view"><SeafarerDetail /></Guard>} />
          <Route path="/legislation" element={<Guard perm="legislation.view"><LegislationPage /></Guard>} />
          <Route path="/companies" element={<Guard perm="facilities.view"><CompaniesPage /></Guard>} />
          <Route path="/companies/:id" element={<Guard perm="facilities.view"><CompanyDetail /></Guard>} />
          <Route path="/registry" element={<Guard perm="registry.view"><RegistrationsList /></Guard>} />
          <Route path="/registry/:id" element={<Guard perm="registry.view"><RegistrationDetail /></Guard>} />
          <Route path="/facilities" element={<Guard perm="facilities.view"><FacilitiesList /></Guard>} />
          <Route path="/facilities/:id" element={<Guard perm="facilities.view"><FacilityDetail /></Guard>} />
          <Route path="/nmc/map" element={<Guard perm="nmc.view"><TrafficMap /></Guard>} />
          <Route path="/nmc/incidents" element={<Navigate to="/incidents" replace />} />
          <Route path="/incidents/overview" element={<Guard perm="incidents.view"><IncidentDashboard /></Guard>} />
          <Route path="/incidents" element={<Guard perm="incidents.view"><IncidentsRegister /></Guard>} />
          <Route path="/incidents/:id" element={<Guard perm="incidents.view"><IncidentCase /></Guard>} />
          <Route path="/incidents/risk-matrix" element={<Guard perm="incidents.view"><RiskMatrix /></Guard>} />
          <Route path="/risk" element={<Guard perm="risk.view"><RiskRegister /></Guard>} />
          <Route path="/risk/targeting" element={<Guard perm="risk.view"><TargetingPage /></Guard>} />
          <Route path="/mis" element={<Guard perm="reports.view"><MisReport /></Guard>} />
          <Route path="/reports" element={<Guard perm="reports.view"><ReportLibrary /></Guard>} />
          <Route path="/reports/view/:key" element={<Guard perm="reports.view"><ReportViewer /></Guard>} />
          <Route path="/settings/module/:moduleKey" element={<Guard><ModuleSettingsPage /></Guard>} />
          <Route path="/profile" element={<Guard><ProfilePage /></Guard>} />
          <Route path="*" element={<StatePage code="404" title="Page not found" message="The page you're looking for doesn't exist." />} />
        </Route>
      </Routes>
      </Suspense>
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
