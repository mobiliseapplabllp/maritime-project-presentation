/* Module registry — drives the header icon strip, the app launcher, and the
 * per-module side navigation. A module is visible when the user holds its perm. */
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

export const MODULES = [
  {
    key: 'home', name: 'Dashboard', short: 'Home', color: '#0B74B0',
    desc: 'Port-wide KPIs, throughput, berth board and activity',
    icon: DashboardRoundedIcon, perm: 'dashboard.view', home: '/',
    nav: [{ header: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: DashboardRoundedIcon, perm: 'dashboard.view', end: true }] }],
  },
  {
    key: 'ops', name: 'Port Operations', short: 'Operations', color: '#0797A5',
    desc: 'Port calls, berthing, cargo operations and the live board',
    icon: ViewTimelineRoundedIcon, perm: 'portcalls.view', home: '/port-calls',
    nav: [{
      header: 'Operations',
      items: [
        { to: '/port-calls', label: 'Port Calls', icon: ViewTimelineRoundedIcon, perm: 'portcalls.view' },
        { to: '/berth-board', label: 'Berth Board', icon: AnchorRoundedIcon, perm: 'portcalls.view' },
      ],
    }],
  },
  {
    key: 'ships', name: 'Ships Registry', short: 'Ships', color: '#3B6FB6',
    desc: 'Vessel particulars and statutory certificates',
    icon: DirectionsBoatFilledRoundedIcon, perm: 'vessels.view', home: '/vessels',
    nav: [{
      header: 'Registry',
      items: [
        { to: '/vessels', label: 'Vessels', icon: DirectionsBoatFilledRoundedIcon, perm: 'vessels.view' },
        { to: '/certificates', label: 'Certificates', icon: WorkspacePremiumRoundedIcon, perm: 'certificates.view' },
      ],
    }],
  },
  {
    key: 'crew', name: 'Seafarers', short: 'Seafarers', color: '#75479C',
    desc: 'Crew register — competency, medicals and sea service',
    icon: GroupsRoundedIcon, perm: 'seafarers.view', home: '/seafarers',
    nav: [{
      header: 'Crew',
      items: [{ to: '/seafarers', label: 'Seafarer Register', icon: BadgeRoundedIcon, perm: 'seafarers.view' }],
    }],
  },
  {
    key: 'legis', name: 'Legislation & Circulars', short: 'Legislation', color: '#8A5A2B',
    desc: 'Acts, rules, circulars and notices — with acknowledgments',
    icon: GavelRoundedIcon, perm: 'legislation.view', home: '/legislation',
    nav: [{
      header: 'Instruments',
      items: [{ to: '/legislation', label: 'Instrument Library', icon: GavelRoundedIcon, perm: 'legislation.view' }],
    }],
  },
  {
    key: 'nmc', name: 'Maritime Centre', short: 'MDA', color: '#0B4F8A',
    desc: 'Live traffic picture, MDA alerts, incidents and SAR',
    icon: RadarRoundedIcon, perm: 'nmc.view', home: '/nmc/map',
    nav: [{
      header: 'Domain awareness',
      items: [
        { to: '/nmc/map', label: 'Live Traffic', icon: MapRoundedIcon, perm: 'nmc.view' },
        { to: '/nmc/incidents', label: 'Incidents & SAR', icon: CrisisAlertRoundedIcon, perm: 'nmc.view' },
      ],
    }],
  },
  {
    key: 'inspect', name: 'Inspection & Audit', short: 'Inspection', color: '#9C6412',
    desc: 'PSC, FSI, ISM, ISPS and MLC inspections with findings',
    icon: FactCheckRoundedIcon, perm: 'inspections.view', home: '/inspections',
    nav: [{
      header: 'Compliance',
      items: [{ to: '/inspections', label: 'Inspections', icon: FactCheckRoundedIcon, perm: 'inspections.view' }],
    }],
  },
  {
    key: 'risk', name: 'Compliance & Risk', short: 'Risk', color: '#A33229',
    desc: 'Explainable vessel risk scores and PSC targeting',
    icon: InsightsRoundedIcon, perm: 'risk.view', home: '/risk',
    nav: [{
      header: 'Risk engine',
      items: [
        { to: '/risk', label: 'Risk Register', icon: InsightsRoundedIcon, perm: 'risk.view', end: true },
        { to: '/risk/targeting', label: 'PSC Targeting', icon: TrackChangesRoundedIcon, perm: 'risk.view' },
      ],
    }],
  },
  {
    key: 'facil', name: 'Facilities & Companies', short: 'Facilities', color: '#2C6E52',
    desc: 'Licensing of agencies, suppliers, yards and institutes',
    icon: CorporateFareRoundedIcon, perm: 'facilities.view', home: '/facilities',
    nav: [{
      header: 'Licensing',
      items: [{ to: '/facilities', label: 'Licence Register', icon: CorporateFareRoundedIcon, perm: 'facilities.view' }],
    }],
  },
  {
    key: 'finance', name: 'Finance', short: 'Finance', color: '#BD3861',
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
    key: 'masters', name: 'Masters', short: 'Masters', color: '#5A6B78',
    desc: 'Berths, lookups and checklist templates',
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
    if (pathname.startsWith('/inspections')) return MODULES.find((m) => m.key === 'inspect');
    if (pathname.startsWith('/invoices')) return MODULES.find((m) => m.key === 'finance');
    if (pathname.startsWith('/port-calls')) return MODULES.find((m) => m.key === 'ops');
  }
  return best ? best.m : MODULES[0];
};
