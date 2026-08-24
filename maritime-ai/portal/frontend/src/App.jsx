import React, { useState } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./lib/auth.jsx";
import { useLang, LangSwitcher } from "./lib/i18n.jsx";
import Login from "./components/Login.jsx";
import ChatWidget from "./components/ChatWidget.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Assistant from "./pages/Assistant.jsx";
import Agents from "./pages/Agents.jsx";
import Anomalies from "./pages/Anomalies.jsx";
import Validation from "./pages/Validation.jsx";
import Hotspots from "./pages/Hotspots.jsx";
import Districts from "./pages/Districts.jsx";
import Predictions from "./pages/Predictions.jsx";
import Methodology from "./pages/Methodology.jsx";
import DataCatalog from "./pages/DataCatalog.jsx";
import VoiceMode from "./pages/VoiceMode.jsx";
import { FleetSection, IncidentsSection, InspectionsSection, CertificatesSection, RevenueSection, CrewSection } from "./pages/Sections.jsx";
import { DrawerProvider } from "./components/RecordDrawer.jsx";
import AssetPortal from "./pages/AssetPortal.jsx";
import { EmployeePortal, FacilityPortal, DistrictPortal } from "./pages/EntityPortals.jsx";
import TrainingLog from "./pages/TrainingLog.jsx";
import UserAdmin from "./pages/UserAdmin.jsx";
import YearGoneBy from "./components/YearGoneBy.jsx";
import InterestingFacts from "./components/InterestingFacts.jsx";
import { StateIntel, RivalsIntel } from "./pages/Research.jsx";

const NAV = [
  { section: "Overview" },
  { to: "/", label: "Dashboard", ic: "▚", end: true },
  { to: "/assistant", label: "Sagar Intelligence", ic: "✦" },
  { to: "/voice", label: "Voice Mode", ic: "◉" },
  { to: "/agents", label: "Agent Operations", ic: "⬡" },
  { to: "/districts", label: "Port Explorer", ic: "▤" },
  { to: "/year", label: "Year Gone By", ic: "◷" },
  { to: "/facts", label: "Interesting Facts", ic: "✧" },
  { to: "/intel/state", label: "Mundra vs Major Ports", ic: "⚖" },
  { to: "/intel/rivals", label: "APSEZ vs Port Operators", ic: "♟" },
  { section: "Deep Analysis" },
  { to: "/sec/assets", label: "Fleet & Vessels", ic: "▦" },
  { to: "/sec/complaints", label: "Incidents", ic: "▲" },
  { to: "/sec/pm", label: "Inspections & Surveys", ic: "◇" },
  { to: "/sec/calibration", label: "Certificates", ic: "◬" },
  { to: "/sec/penalty", label: "Revenue & Receivables", ic: "₹" },
  { to: "/sec/employees", label: "Crew & Manning", ic: "◫" },
  { section: "AI Analysis" },
  { to: "/anomalies", label: "Operations Audit", ic: "⚠" },
  { to: "/validation", label: "Benchmark vs Major Ports", ic: "≈" },
  { to: "/hotspots", label: "Terminal Hotspots", ic: "◎" },
  { to: "/predictions", label: "Early Warning", ic: "◔" },
  { to: "/training", label: "Training Log", ic: "✔" },
];
const ADMIN_NAV = [
  { section: "Administration" },
  { to: "/admin/users", label: "Users & Email", ic: "◐" },
  { to: "/data", label: "Data Catalogue", ic: "⛁" },
  { to: "/methodology", label: "Data & Method", ic: "ℹ" },
];

// group the flat nav into collapsible [{ section, items }] blocks for the accordion menu
function groupNav(flat) {
  const groups = [];
  let cur = null;
  for (const n of flat) {
    if (n.section) { cur = { section: n.section, items: [] }; groups.push(cur); }
    else if (cur) cur.items.push(n);
    else { cur = { section: "", items: [n] }; groups.push(cur); }
  }
  return groups;
}

const TITLES = {
  "/": "Dashboard", "/assistant": "Sagar Intelligence", "/voice": "Voice Mode",
  "/agents": "Agent Operations", "/anomalies": "Operations Audit",
  "/validation": "Benchmark vs Major Ports", "/hotspots": "Terminal Hotspots",
  "/predictions": "Early Warning", "/districts": "Port Explorer",
  "/year": "Year Gone By", "/facts": "Interesting Facts",
  "/intel/state": "Mundra vs Major Ports", "/intel/rivals": "APSEZ vs Port Operators",
  "/methodology": "Data & Methodology",
  "/data": "Data Catalogue",
  "/sec/assets": "Fleet & Vessels — Deep Analysis", "/sec/complaints": "Incidents — Deep Analysis",
  "/sec/pm": "Inspections & Surveys — Deep Analysis", "/sec/calibration": "Certificates — Statutory Register",
  "/training": "Training Log — QA loop", "/admin/users": "Users & Email", "/sec/penalty": "Revenue & Receivables", "/sec/employees": "Crew & Manning — Deep Analysis",
};

class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      const e = this.state.err;
      return (
        <div style={{ padding: 24 }}>
          <div className="hint" style={{ borderColor: "var(--crit)" }}>
            <b>This page hit an error.</b> The rest of the app is unaffected — pick another page from the menu.
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 10, color: "var(--muted)", overflow: "auto" }}>
              {String((e && (e.stack || e.message)) || e)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Shell() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [latestMonth, setLatestMonth] = useState(window.__latestMonth || "");
  React.useEffect(() => {
    let live = true;
    import("./lib/api.js").then(({ api }) => api.get("/overview")).then((d) => {
      if (live && d?.latest_month) { window.__latestMonth = d.latest_month; setLatestMonth(d.latest_month); }
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const [collapsed, setCollapsed] = useState(localStorage.getItem("sagar_nav") === "collapsed");
  const toggleNav = () => setCollapsed((c) => {
    localStorage.setItem("sagar_nav", c ? "" : "collapsed");
    return !c;
  });
  const loc = useLocation();
  const { t } = useLang();

  // accordion side menu — one section open at a time; the section holding the
  // current route auto-opens (and collapses the rest)
  const navGroups = React.useMemo(
    () => groupNav([...NAV, ...(user?.is_admin ? ADMIN_NAV : [])]), [user?.is_admin]);
  const routeSection = React.useMemo(() => {
    for (const g of navGroups) if (g.items.some((it) => it.to === loc.pathname)) return g.section;
    return null;   // detail routes (vessel/berth/…) aren't in the menu — keep current section open
  }, [navGroups, loc.pathname]);
  const [openSection, setOpenSection] = useState(() => routeSection || navGroups[0]?.section);
  React.useEffect(() => { if (routeSection) setOpenSection(routeSection); }, [routeSection]);

  const title = t(TITLES[loc.pathname] || "Sagar Drishti");
  const initials = (user?.name || "U").split(" ").map((w) => w[0]).slice(0, 2).join("");
  const orgTag = user?.persona === "authority" ? "Mundra Port (Authority)" : "Terminal Operator";

  return (
    <DrawerProvider>
    <div className={`shell ${collapsed ? "nav-collapsed" : ""}`}>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sb-brand">
          <div className="mark">◈</div>
          <div>
            <div className="t">Sagar Drishti</div>
            <div className="s">Mundra Port · Kutch, Gujarat</div>
          </div>
        </div>
        <nav className="sb-nav" onClick={() => setOpen(false)}>
          {navGroups.map((g, gi) => {
            const isOpen = openSection === g.section;
            return (
              <div className={`sb-group ${isOpen ? "" : "closed"}`} key={gi}>
                {g.section && (
                  <button className={`sb-section ${isOpen ? "open" : ""}`}
                    onClick={(e) => { e.stopPropagation(); setOpenSection((s) => s === g.section ? null : g.section); }}>
                    <span>{t(g.section)}</span><span className="chev">▶</span>
                  </button>
                )}
                <div className="sb-items">
                  {g.items.map((n, i) => (
                    <NavLink key={i} to={n.to} end={n.end}
                      className={({ isActive }) => `sb-link ${isActive ? "active" : ""}`}>
                      <span className="ic">{n.ic}</span> {t(n.label)}
                    </NavLink>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="sb-foot">v1.0 · Sagar Drishti analytics build</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn nav-toggle" title={collapsed ? "Show side menu" : "Collapse side menu"}
            onClick={toggleNav}>{collapsed ? "☰" : "⟨⟨"}</button>
          <div>
            <div className="pagetitle">{title}</div>
            <div className="crumb">Sagar Drishti / {orgTag}</div>
          </div>
          <div className="spacer" />
          <LangSwitcher />
          <span className="chip">{t("Latest")}: {latestMonth || "…"}</span>
          <div className="user">
            <div className="av">{initials}</div>
            <div>
              <div className="nm">{user?.name}</div>
              <div className="rl">{user?.role}</div>
            </div>
          </div>
          <button className="btn" onClick={logout}>{t("Sign out")}</button>
        </header>

        <main className="content">
          <ErrorBoundary key={loc.pathname}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/anomalies" element={<Anomalies />} />
            <Route path="/validation" element={<Validation />} />
            <Route path="/hotspots" element={<Hotspots />} />
            <Route path="/predictions" element={<Predictions />} />
            <Route path="/training" element={<TrainingLog />} />
            <Route path="/admin/users" element={<UserAdmin />} />
            <Route path="/districts" element={<Districts />} />
            <Route path="/year" element={<YearGoneBy />} />
            <Route path="/facts" element={<InterestingFacts />} />
            <Route path="/intel/state" element={<StateIntel />} />
            <Route path="/intel/rivals" element={<RivalsIntel />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="/data" element={<DataCatalog />} />
            <Route path="/voice" element={<VoiceMode />} />
            <Route path="/asset/:barcode" element={<AssetPortal />} />
            <Route path="/employee/:code" element={<EmployeePortal />} />
            <Route path="/facility/:name" element={<FacilityPortal />} />
            <Route path="/district/:name" element={<DistrictPortal />} />
            <Route path="/sec/assets" element={<FleetSection />} />
            <Route path="/sec/complaints" element={<IncidentsSection />} />
            <Route path="/sec/pm" element={<InspectionsSection />} />
            <Route path="/sec/calibration" element={<CertificatesSection />} />
            {/* the old QA sections pack no longer exists — keep the link alive */}
            <Route path="/sec/qa" element={<Navigate to="/training" replace />} />
            <Route path="/sec/penalty" element={<RevenueSection />} />
            <Route path="/sec/employees" element={<CrewSection />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </ErrorBoundary>
        </main>
      </div>
      <ChatWidget />
    </div>
    </DrawerProvider>
  );
}

export default function App() {
  const { user, loading } = useAuth();
  const { t } = useLang();
  if (loading) return <div className="loading">{t("Loading Sagar Drishti…")}</div>;
  if (!user) return <Login />;
  return <Shell />;
}
