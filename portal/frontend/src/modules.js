/* Module registry — drives the app launcher and the per-module side navigation.
 * A module is visible when the user holds its perm. */
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import ViewTimelineRoundedIcon from '@mui/icons-material/ViewTimelineRounded';
import DirectionsBoatFilledRoundedIcon from '@mui/icons-material/DirectionsBoatFilledRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import GavelRoundedIcon from '@mui/icons-material/GavelRounded';
import RadarRoundedIcon from '@mui/icons-material/RadarRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import CorporateFareRoundedIcon from '@mui/icons-material/CorporateFareRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
import AdminPanelSettingsRoundedIcon from '@mui/icons-material/AdminPanelSettingsRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import AnchorRoundedIcon from '@mui/icons-material/AnchorRounded';
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import PriceChangeRoundedIcon from '@mui/icons-material/PriceChangeRounded';
import MapRoundedIcon from '@mui/icons-material/MapRounded';
import CrisisAlertRoundedIcon from '@mui/icons-material/CrisisAlertRounded';
import BadgeRoundedIcon from '@mui/icons-material/BadgeRounded';
import TrackChangesRoundedIcon from '@mui/icons-material/TrackChangesRounded';
import SpaceDashboardRoundedIcon from '@mui/icons-material/SpaceDashboardRounded';
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded';
import DirectionsBoatRoundedIcon from '@mui/icons-material/DirectionsBoatRounded';
import HealthAndSafetyRoundedIcon from '@mui/icons-material/HealthAndSafetyRounded';
import MonitorHeartRoundedIcon from '@mui/icons-material/MonitorHeartRounded';

export const MODULES = [
  {
    key: 'home', name: 'Command Centre', short: 'Home', color: '#0B74B0',
    desc: 'Port-wide KPIs, throughput, berth occupancy and live activity',
    icon: DashboardRoundedIcon, perm: 'dashboard.view', home: '/',
    nav: [{ header: 'Overview', items: [{ to: '/', label: 'Command Centre', icon: DashboardRoundedIcon, perm: 'dashboard.view', end: true }] }],
  },
  {
    key: 'ops', name: 'Harbour Operations', short: 'Harbour', color: '#0797A5',
    desc: 'Vessel calls, quay view, day schedule, berthing and marine craft',
    icon: ViewTimelineRoundedIcon, perm: 'portcalls.view', home: '/port-calls',
    nav: [{
      header: 'Marine operations',
      items: [
        { to: '/port-calls', label: 'Vessel Calls', icon: ViewTimelineRoundedIcon, perm: 'portcalls.view' },
        { to: '/berth-board', label: 'Berth Board', icon: AnchorRoundedIcon, perm: 'portcalls.view' },
        { to: '/quay-view', label: 'Quay View (2D)', icon: SpaceDashboardRoundedIcon, perm: 'portcalls.view' },
        { to: '/schedule', label: 'Vessel Schedule', icon: EventNoteRoundedIcon, perm: 'portcalls.view' },
        { to: '/marine-services', label: 'Marine Craft & Pilots', icon: DirectionsBoatRoundedIcon, perm: 'portcalls.view' },
      ],
    }],
  },
  {
    key: 'ships', name: 'Fleet Manager', short: 'Fleet', color: '#3B6FB6',
    desc: 'Vessel particulars, certificates, voyages and risk profiling',
    icon: DirectionsBoatFilledRoundedIcon, perm: 'vessels.view', home: '/fleet',
    nav: [{
      header: 'Fleet',
      items: [
        { to: '/fleet', label: 'Fleet Dashboard', icon: SpaceDashboardRoundedIcon, perm: 'vessels.view', end: true },
        { to: '/vessels', label: 'Vessel Register', icon: DirectionsBoatFilledRoundedIcon, perm: 'vessels.view' },
        { to: '/certificates', label: 'Certificates', icon: WorkspacePremiumRoundedIcon, perm: 'certificates.view' },
        { to: '/risk', label: 'Vessel Risk Register', icon: InsightsRoundedIcon, perm: 'risk.view', end: true },
      ],
    }],
  },
  {
    key: 'crew', name: 'Crew & Manning', short: 'Crew', color: '#75479C',
    desc: 'Crew records — competency, medicals and sea service',
    icon: GroupsRoundedIcon, perm: 'seafarers.view', home: '/seafarers',
    nav: [{
      header: 'Crew',
      items: [{ to: '/seafarers', label: 'Crew Register', icon: BadgeRoundedIcon, perm: 'seafarers.view' }],
    }],
  },
  {
    key: 'legis', name: 'Regulatory Desk', short: 'Regulatory', color: '#8A5A2B',
    desc: 'Acts, rules, notices and circulars — with acknowledgments',
    icon: GavelRoundedIcon, perm: 'legislation.view', home: '/legislation',
    nav: [{
      header: 'Instruments',
      items: [{ to: '/legislation', label: 'Instrument Library', icon: GavelRoundedIcon, perm: 'legislation.view' }],
    }],
  },
  {
    key: 'nmc', name: 'Ocean Watch', short: 'Watch', color: '#0B4F8A',
    desc: 'Live traffic picture and derived surveillance alerts',
    icon: RadarRoundedIcon, perm: 'nmc.view', home: '/nmc/map',
    nav: [{
      header: 'Surveillance',
      items: [{ to: '/nmc/map', label: 'Live Traffic', icon: MapRoundedIcon, perm: 'nmc.view' }],
    }],
  },
  {
    key: 'incidents', name: 'Incident Desk', short: 'Incidents', color: '#B3452E',
    desc: 'HSE & marine incident case files — response, RCA and closure',
    icon: CrisisAlertRoundedIcon, perm: 'incidents.view', home: '/incidents',
    nav: [{
      header: 'Case management',
      items: [
        { to: '/incidents/overview', label: 'Incident Dashboard', icon: MonitorHeartRoundedIcon, perm: 'incidents.view' },
        { to: '/incidents', label: 'Incident Register', icon: CrisisAlertRoundedIcon, perm: 'incidents.view', end: true },
      ],
    }],
  },
  {
    key: 'inspect', name: 'Survey & Audit Cell', short: 'Surveys', color: '#9C6412',
    desc: 'PSC, FSI, ISM, ISPS and MLC surveys with findings and targeting',
    icon: FactCheckRoundedIcon, perm: 'inspections.view', home: '/inspections',
    nav: [{
      header: 'Surveys',
      items: [
        { to: '/inspections', label: 'Survey Register', icon: FactCheckRoundedIcon, perm: 'inspections.view' },
        { to: '/risk/targeting', label: 'Boarding Targets', icon: TrackChangesRoundedIcon, perm: 'risk.view' },
      ],
    }],
  },
  {
    key: 'facil', name: 'Trade Partners', short: 'Partners', color: '#2C6E52',
    desc: 'Licensing of agencies, suppliers, yards and institutes',
    icon: CorporateFareRoundedIcon, perm: 'facilities.view', home: '/facilities',
    nav: [{
      header: 'Licensing',
      items: [{ to: '/facilities', label: 'Licence Register', icon: CorporateFareRoundedIcon, perm: 'facilities.view' }],
    }],
  },
  {
    key: 'finance', name: 'Revenue & Billing', short: 'Revenue', color: '#BD3861',
    desc: 'Invoicing, tariffs and collections',
    icon: ReceiptLongRoundedIcon, perm: 'invoices.view', home: '/invoices',
    nav: [{
      header: 'Billing',
      items: [
        { to: '/invoices', label: 'Invoices', icon: ReceiptLongRoundedIcon, perm: 'invoices.view' },
        { to: '/masters/tariffs', label: 'Tariffs', icon: PriceChangeRoundedIcon, perm: 'tariffs.view' },
      ],
    }],
  },
  {
    key: 'mis', name: 'MIS Reports', short: 'MIS', color: '#0B5D8A',
    desc: 'Management reports — cargo, traffic, revenue, compliance',
    icon: AssessmentRoundedIcon, perm: 'reports.view', home: '/mis',
    nav: [{
      header: 'Reporting',
      items: [{ to: '/mis', label: 'MIS Report', icon: AssessmentRoundedIcon, perm: 'reports.view' }],
    }],
  },
  {
    key: 'masters', name: 'Data Studio', short: 'Masters', color: '#5A6B78',
    desc: 'Berth master, lookups and checklist templates',
    icon: HubRoundedIcon, perm: 'masters.view', home: '/masters/berths',
    nav: [{
      header: 'Reference data',
      items: [
        { to: '/masters/berths', label: 'Berths & Terminals', icon: HubRoundedIcon, perm: 'masters.view' },
        { to: '/masters/lookups', label: 'Lookups', icon: ListAltRoundedIcon, perm: 'masters.view' },
        { to: '/masters/checklists', label: 'Checklist Templates', icon: ChecklistRoundedIcon, perm: 'masters.view' },
      ],
    }],
  },
  {
    key: 'admin', name: 'Administration', short: 'Admin', color: '#0A2239',
    desc: 'Users, roles, audit log and settings',
    icon: AdminPanelSettingsRoundedIcon, perm: 'users.view', home: '/admin/users',
    nav: [{
      header: 'Administration',
      items: [
        { to: '/admin/users', label: 'Users', icon: GroupRoundedIcon, perm: 'users.view' },
        { to: '/admin/roles', label: 'Roles & Permissions', icon: AdminPanelSettingsRoundedIcon, perm: 'roles.view' },
        { to: '/admin/audit', label: 'Audit Log', icon: HistoryRoundedIcon, perm: 'audit.view' },
        { to: '/admin/settings', label: 'Settings', icon: SettingsRoundedIcon, perm: 'settings.view' },
      ],
    }],
  },
];

// safety icon reused by incident pages
export { HealthAndSafetyRoundedIcon };

export const moduleOf = (pathname) => {
  if (pathname === '/') return MODULES[0];
  let best = null;
  for (const m of MODULES) {
    for (const g of m.nav) {
      for (const item of g.items) {
        if (item.to !== '/' && pathname.startsWith(item.to) && (!best || item.to.length > best.len)) {
          best = { m, len: item.to.length };
        }
      }
    }
  }
  if (!best) {
    if (pathname.startsWith('/vessels')) return MODULES.find((m) => m.key === 'ships');
    if (pathname.startsWith('/seafarers')) return MODULES.find((m) => m.key === 'crew');
    if (pathname.startsWith('/facilities')) return MODULES.find((m) => m.key === 'facil');
    if (pathname.startsWith('/nmc')) return MODULES.find((m) => m.key === 'nmc');
    if (pathname.startsWith('/incidents')) return MODULES.find((m) => m.key === 'incidents');
    if (pathname.startsWith('/inspections')) return MODULES.find((m) => m.key === 'inspect');
    if (pathname.startsWith('/invoices')) return MODULES.find((m) => m.key === 'finance');
    if (pathname.startsWith('/port-calls')) return MODULES.find((m) => m.key === 'ops');
  }
  return best ? best.m : MODULES[0];
};
