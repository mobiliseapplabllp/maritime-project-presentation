import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLang } from "../lib/i18n.jsx";
import { api } from "../lib/api.js";
import { Card, Loading, StatTile, DataTable, Hint, fmtInt } from "../components/ui.jsx";
import { TrendLine, MiniBars } from "../components/charts.jsx";
import Markdown from "../components/Markdown.jsx";
import { RecordLink } from "../components/RecordDrawer.jsx";
import ReportActions from "../components/ReportActions.jsx";

const cr = (v) => (v == null ? "—" : "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " Cr");
const pct = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);
const hrs = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}h`);
const dt = (v) => (v ? String(v).slice(0, 10) : "—");
const CERT_TONE = { VALID: "var(--good)", EXPIRING: "var(--warn, var(--gold))", EXPIRED: "var(--crit)" };

// Routes stay /employee/:code, /facility/:name, /district/:name — the params are
// the seafarer's CDC number, the berth code and the terminal id; only labels changed.
function usePortal(kind, id) {
  const { lang } = useLang();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [brief, setBrief] = useState(null);
  const [busy, setBusy] = useState(false);
  const enc = (kind === "facility" || kind === "district") ? encodeURIComponent(id) : id;
  useEffect(() => {
    setD(null); setErr(""); setBrief(null);
    api.get(`/records/${kind}/${enc}`)
      .then(setD).catch((e) => setErr(e.message));
  }, [kind, id]);
  const runBrief = async (force = 0) => {
    setBusy(true);
    try {
      const r = await api.get(`/records/analysis/${kind}/${enc}${force ? "?force=1" : ""}`);
      setBrief(r.report);
    } catch (e) { setBrief(`_${e.message}_`); }
    setBusy(false);
  };
  // re-generate an already-shown brief in the newly selected language
  useEffect(() => { if (brief) runBrief(); }, [lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  return { d, err, brief, busy, runBrief };
}

function PortalShell({ back, idLine, title, subtitle, chips, nav, sec, setSec, children }) {
  const { t } = useLang();
  return (
    <div className="ap-shell">
      <aside className="ap-nav">
        <button className="btn" onClick={back}>{t("← Back")}</button>
        <div className="ap-id">
          <div className="ap-bc">◈ {idLine}</div>
          <div className="ap-dev">{title}</div>
          <div className="ap-fac">{subtitle}</div>
          <div className="ap-chips">{chips}</div>
        </div>
        {nav.map((n, k) => n.section
          ? <div className="ap-sec" key={k}>{t(n.section)}</div>
          : <button key={k} className={`ap-link ${sec === n.id ? "on" : ""}`} onClick={() => n.onClick(n.id)}>
              <span className="ic">{n.ic}</span> {t(n.label)}
            </button>)}
      </aside>
      <main className="ap-main">{children}</main>
    </div>
  );
}

/* ================================ SEAFARER PORTAL ================================ */
export function EmployeePortal() {
  const { code } = useParams();            // the seafarer's CDC number
  const navr = useNavigate();
  const { d, err, brief, busy, runBrief } = usePortal("employee", code);
  const { t } = useLang();
  const [sec, setSec] = useState("overview");
  if (err) return <Card>{err}</Card>;
  if (!d) return <Loading text={`Loading seafarer ${code}…`} />;
  const i = d.identity;
  const go = (id) => { setSec(id); if (id === "ai" && !brief && !busy) runBrief(); };
  const nav = [
    { section: "Seafarer" },
    { id: "overview", label: "Dashboard", ic: "▚", onClick: go },
    { id: "certs", label: "Certificates", ic: "◬", onClick: go },
    { id: "service", label: "Sea Service", ic: "⚓", onClick: go },
    { section: "Intelligence" },
    { id: "ai", label: "AI Analyst", ic: "✦", onClick: go },
  ];
  return (
    <PortalShell back={() => navr(-1)} idLine={`CDC ${i.cdc_no}`} title={i.name || i.cdc_no}
      subtitle={`${i.rank || "—"} · ${i.nationality || "—"}`} nav={nav} sec={sec} setSec={setSec}
      chips={<>
        <span className="ap-chip">{i.status}</span>
        {i.current_vessel && <span className="ap-chip">{t("onboard {v}", { v: i.current_vessel })}</span>}
        {i.cert_expired > 0 && <span className="ap-chip crit">{t("{n} cert expired", { n: i.cert_expired })}</span>}
      </>}>
      {sec === "overview" && (<>
        <h2 className="ap-h">{t("Seafarer dashboard")} <span style={{ color: "var(--accent)", fontWeight: 700 }}>— {i.name || i.cdc_no}</span></h2>
        <ReportActions kind="crew" scope={i.cdc_no} />
        <div className="grid kpis" style={{ marginBottom: 16 }}>
          <StatTile label="Rank" value={i.rank || "—"} note={t("INDOS {n}", { n: i.indos_no || "—" })} />
          <StatTile label="Status" value={i.status || "—"} note={i.current_vessel ? t("onboard {v}", { v: i.current_vessel }) : t("ashore")} tone={i.status === "ACTIVE" ? "good" : "accent"} />
          <StatTile label="Certificates" value={fmtInt(i.certificates)} note={t("{a} expired · {b} expiring", { a: fmtInt(i.cert_expired), b: fmtInt(i.cert_expiring) })} tone={i.cert_expired ? "crit" : i.cert_expiring ? "warn" : "good"} />
          <StatTile label="Vessels served" value={fmtInt((d.vessels_served || []).length)} note={(d.vessels_served || []).slice(0, 2).join(" · ")} />
        </div>
        <Card title="Identity">
          <table className="dtable"><tbody>
            <tr><td>{t("CDC no.")}</td><td><b>{i.cdc_no}</b></td><td>{t("INDOS no.")}</td><td><b>{i.indos_no || "—"}</b></td></tr>
            <tr><td>{t("Date of birth")}</td><td><b>{dt(i.dob)}</b></td><td>{t("Nationality")}</td><td><b>{i.nationality || "—"}</b></td></tr>
            <tr><td>{t("Phone")}</td><td colSpan={3}>{i.phone || "—"}</td></tr>
            <tr><td>{t("Email")}</td><td colSpan={3}>{i.email || "—"}</td></tr>
            <tr><td>{t("Current vessel")}</td><td colSpan={3}>{i.current_vessel ? <RecordLink type="asset" id={i.current_vessel_imo}>{i.current_vessel}</RecordLink> : "—"}</td></tr>
          </tbody></table>
        </Card>
        {d.note && <Hint>{d.note}</Hint>}
      </>)}
      {sec === "certs" && (<>
        <h2 className="ap-h">{t("Certificates (STCW & statutory)")}</h2>
        <Card pad={false}>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{t("Certificate")}</th><th>{t("Grade")}</th><th>{t("Number")}</th><th>{t("Issuer")}</th><th>{t("Issued")}</th><th>{t("Expiry")}</th><th>{t("Status")}</th></tr></thead>
            <tbody>{(d.certificates || []).map((c, k) => (
              <tr key={k}><td>{c.cert_type}</td><td>{c.grade || "—"}</td>
                <td className="mono" style={{ fontSize: 12 }}>{c.number}</td><td>{c.issuer}</td>
                <td>{c.issue_date}</td><td>{c.expiry_date}</td>
                <td><b style={{ color: CERT_TONE[c.status] || "inherit" }}>{c.status}</b></td></tr>))}
            </tbody></table></div>
        </Card>
        <Hint>{t("Expired certificates block sign-on. Renewals are a crewing-workflow action — raise them with the Crewing Manager.")}</Hint>
      </>)}
      {sec === "service" && (<>
        <h2 className="ap-h">{t("Sea service record")}</h2>
        <Card pad={false}>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{t("Vessel")}</th><th>{t("Rank")}</th><th>{t("From")}</th><th>{t("To")}</th><th>{t("Days")}</th><th>{t("Verified")}</th></tr></thead>
            <tbody>{(d.sea_service || []).map((s, k) => (
              <tr key={k}><td><RecordLink type="asset" id={s.imo}>{s.vessel}</RecordLink></td>
                <td>{s.rank}</td><td>{s.from}</td><td>{s.to || t("serving")}</td>
                <td className="num">{fmtInt(s.days)}</td><td>{s.verified ? "✓" : "—"}</td></tr>))}
            </tbody></table></div>
        </Card>
      </>)}
      {sec === "ai" && (<>
        <h2 className="ap-h">{t("AI analyst")}</h2>
        {busy ? <Loading text="Analysing this seafarer…" />
          : brief ? (<><Card><Markdown>{brief}</Markdown></Card>
              <button className="btn" onClick={() => runBrief(1)}>{t("↻ Regenerate")}</button></>)
            : <button className="btn primary" onClick={() => runBrief()}>{t("✦ Generate the seafarer brief")}</button>}
      </>)}
    </PortalShell>
  );
}

/* ================================ BERTH PORTAL ================================ */
export function FacilityPortal() {
  const { name } = useParams();            // the berth code, e.g. CT3-1
  const navr = useNavigate();
  const fname = decodeURIComponent(name);
  const { d, err, brief, busy, runBrief } = usePortal("facility", fname);
  const { t } = useLang();
  const [sec, setSec] = useState("overview");
  if (err) return <Card>{err}</Card>;
  if (!d) return <Loading text={`Loading berth ${fname}…`} />;
  const i = d.identity, k = d.kpis || {};
  const go = (id) => { setSec(id); if (id === "ai" && !brief && !busy) runBrief(); };
  const nav = [
    { section: "Berth" },
    { id: "overview", label: "Dashboard", ic: "▚", onClick: go },
    { id: "calls", label: "Recent Calls", ic: "⚓", onClick: go },
    { id: "vessels", label: "Top Vessels", ic: "▦", onClick: go },
    { id: "incidents", label: "Incidents", ic: "▲", onClick: go },
    { section: "Intelligence" },
    { id: "ai", label: "AI Analyst", ic: "✦", onClick: go },
  ];
  return (
    <PortalShell back={() => navr(-1)} idLine={i.btype || "Berth"} title={`${i.berth} — ${i.name || ""}`}
      subtitle={`${i.terminal} · ${i.zone}`} nav={nav} sec={sec} setSec={setSec}
      chips={<>
        <span className={`ap-chip ${i.status === "OPERATIONAL" ? "" : "crit"}`}>{i.status}</span>
        <span className="ap-chip">{t("LOA ≤ {n}m", { n: i.loa_max })}</span>
        <span className="ap-chip">{t("draft ≤ {n}m", { n: i.draft_max })}</span>
      </>}>
      {sec === "overview" && (<>
        <h2 className="ap-h">{t("Berth dashboard")} <span style={{ color: "var(--accent)", fontWeight: 700 }}>— {i.berth}</span></h2>
        <ReportActions kind="berth" scope={i.berth} />
        <div className="grid kpis" style={{ marginBottom: 16 }}>
          <StatTile label="Calls (12m)" value={fmtInt(k.calls_12m)} note={t("{n} MT cargo · {u} TEU", { n: fmtInt(k.cargo_12m_mt), u: fmtInt(k.teu_12m) })} />
          <StatTile label="Avg waiting" value={hrs(k.avg_waiting_hr)} note={t("target 5h · {p}% berthed <6h", { p: k.berthed_lt6h_pct ?? "—" })} tone={k.avg_waiting_hr > 12 ? "crit" : "warn"} />
          <StatTile label="Avg turnaround" value={hrs(k.avg_turnaround_hr)} note={t("arrival to sailing")} tone="accent" />
          <StatTile label="Occupancy" value={pct(k.occupancy_pct)} note={t("healthy band 40–70%")} />
          <StatTile label="Incidents (12m)" value={fmtInt(k.incidents_12m)} note={t("{n} high / critical", { n: fmtInt(k.high_critical_12m) })} tone={k.high_critical_12m > 0 ? "crit" : "good"} />
          <StatTile label="Inspections (12m)" value={fmtInt(k.inspections_12m)} note={t("{n} detention(s)", { n: fmtInt(k.detentions_12m) })} tone={k.detentions_12m > 0 ? "crit" : "good"} />
        </div>
        <Card title="Monthly calls, waiting & incidents" cap="Vessel calls and incidents per month at this berth, with the average pre-berthing wait.">
          <TrendLine xKey="ym" suffix="" data={(d.monthly || []).map((m) => ({ ym: (m.ym || "").slice(2), calls: m.vessel_calls, waiting: m.avg_waiting_hr, incidents: m.incidents }))}
            lines={[{ key: "calls", name: t("Calls"), color: "var(--accent)" }, { key: "waiting", name: t("Avg wait (h)"), color: "var(--warn, var(--gold))" }, { key: "incidents", name: t("Incidents"), color: "var(--crit)" }]} />
        </Card>
      </>)}
      {sec === "calls" && (<>
        <h2 className="ap-h">{t("Recent calls at this berth")}</h2>
        <Card pad={false}>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{t("Call (VCN)")}</th><th>{t("Vessel")}</th><th>{t("Status")}</th><th>{t("Arrived")}</th><th>{t("Sailed")}</th><th>{t("Waiting")}</th><th>{t("Cargo MT")}</th></tr></thead>
            <tbody>{(d.recent_calls || []).map((c) => (
              <tr key={c.vcn}><td className="mono" style={{ fontSize: 12 }}>{c.vcn}</td>
                <td><RecordLink type="asset" id={c.imo}>{c.vessel}</RecordLink></td>
                <td>{c.status}</td><td>{dt(c.ata)}</td><td>{dt(c.atd)}</td>
                <td className="num">{c.waiting_hr != null ? `${c.waiting_hr}h` : "—"}</td>
                <td className="num">{fmtInt(c.cargo_mt)}</td></tr>))}
            </tbody></table></div>
        </Card>
      </>)}
      {sec === "vessels" && (<>
        <h2 className="ap-h">{t("Vessels that use this berth most")}</h2>
        <Card pad={false}>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{t("Vessel")}</th><th>{t("IMO")}</th><th>{t("Type")}</th><th>{t("Calls")}</th></tr></thead>
            <tbody>{(d.top_vessels || []).map((v) => (
              <tr key={v.imo}><td><RecordLink type="asset" id={v.imo}>{v.vessel}</RecordLink></td>
                <td className="mono">{v.imo}</td><td>{v.type}</td><td className="num">{fmtInt(v.calls)}</td></tr>))}
            </tbody></table></div>
        </Card>
      </>)}
      {sec === "incidents" && (<>
        <h2 className="ap-h">{t("Incidents at this berth")}</h2>
        <Card pad={false}>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{t("Incident")}</th><th>{t("Title")}</th><th>{t("Severity")}</th><th>{t("Status")}</th><th>{t("Reported")}</th></tr></thead>
            <tbody>{(d.incidents || []).length ? d.incidents.map((x) => (
              <tr key={x.incident}><td><RecordLink type="ticket" id={x.incident} /></td>
                <td>{x.title}</td><td>{x.severity}</td><td>{x.status}</td><td>{dt(x.reported_at)}</td></tr>))
              : <tr><td colSpan={5}>{t("No incidents on record at this berth.")}</td></tr>}
            </tbody></table></div>
        </Card>
      </>)}
      {sec === "ai" && (<>
        <h2 className="ap-h">{t("AI analyst")}</h2>
        {busy ? <Loading text="Analysing this berth…" />
          : brief ? (<><Card><Markdown>{brief}</Markdown></Card>
              <button className="btn" onClick={() => runBrief(1)}>{t("↻ Regenerate")}</button></>)
            : <button className="btn primary" onClick={() => runBrief()}>✦ {t("Generate the berth brief")}</button>}
      </>)}
    </PortalShell>
  );
}

/* ================================ TERMINAL PORTAL ================================ */
export function DistrictPortal() {
  const { name } = useParams();            // the terminal unit id (or name)
  const navr = useNavigate();
  const dname = decodeURIComponent(name);
  const { d, err, brief, busy, runBrief } = usePortal("district", dname);
  const { t } = useLang();
  const [sec, setSec] = useState("overview");
  if (err) return <Card>{err}</Card>;
  if (!d) return <Loading text={`Loading terminal ${dname}…`} />;
  const i = d.identity, r = d.rank || {}, e = d.port_context || {};
  const go = (id) => { setSec(id); if (id === "ai" && !brief && !busy) runBrief(); };
  const nav = [
    { section: "Terminal" },
    { id: "overview", label: "Dashboard", ic: "▚", onClick: go },
    { id: "revenue", label: "Revenue & dues", ic: "₹", onClick: go },
    { id: "berths", label: "Berths", ic: "▤", onClick: go },
    { id: "vessels", label: "Top Vessels", ic: "▦", onClick: go },
    { id: "agents", label: "Agents & Cargo", ic: "◫", onClick: go },
    { id: "incidents", label: "Incidents", ic: "▲", onClick: go },
    { section: "Intelligence" },
    { id: "ai", label: "AI Analyst", ic: "✦", onClick: go },
  ];
  return (
    <PortalShell back={() => navr(-1)} idLine="Terminal" title={i.name || i.terminal}
      subtitle={`${i.zone || "—"} zone · ${fmtInt(i.berths)} berths${i.jv ? " · JV" : ""}`} nav={nav} sec={sec} setSec={setSec}
      chips={<>
        <span className="ap-chip">{fmtInt(i.calls_12m)} {t("calls (12m)")}</span>
        <span className={`ap-chip ${i.risk_score >= 60 ? "crit" : ""}`}>{t("risk {n}/100", { n: i.risk_score })}</span>
        <span className="ap-chip">#{r.risk_rank}/{r.total} {t("risk rank")}</span>
      </>}>
      {sec === "overview" && (<>
        <h2 className="ap-h">{t("Terminal dashboard")} <span style={{ color: "var(--accent)", fontWeight: 700 }}>— {i.name || i.terminal}</span></h2>
        <ReportActions kind="terminal" scope={i.terminal} />
        <div className="grid kpis" style={{ marginBottom: 16 }}>
          <StatTile label="Vessel calls (12m)" value={fmtInt(i.calls_12m)} note={t("{n} MT cargo · #{r}/{tt} by calls", { n: fmtInt(i.cargo_12m_mt), r: r.calls_rank, tt: r.total })} />
          <StatTile label="Avg waiting" value={hrs(i.avg_waiting_hr)} note={t("port avg {n}h · #{r}/{tt} worst", { n: e.avg_terminal_waiting_hr ?? "—", r: r.wait_rank, tt: r.total })} tone={i.avg_waiting_hr > (e.avg_terminal_waiting_hr || 0) ? "crit" : "good"} />
          <StatTile label="Composite risk" value={`${i.risk_score}/100`} note={t("#{r} of {tt} terminals", { r: r.risk_rank, tt: r.total })} tone={i.risk_score >= 60 ? "crit" : i.risk_score >= 30 ? "warn" : "good"} />
          <StatTile label="Incidents (12m)" value={fmtInt(i.incidents_12m)} note={t("{a} high/crit · {b} injuries · {c}% of port incidents", { a: fmtInt(i.high_critical), b: fmtInt(i.injuries), c: e.port_incident_share_pct ?? "—" })} tone="warn" />
          <StatTile label="Occupancy" value={pct(i.occupancy_pct)} note={t("{n} per 100 calls incident rate", { n: i.incidents_per_100_calls })} />
          <StatTile label="Outstanding dues" value={cr(i.outstanding_cr)} note={t("collection {n}%", { n: i.collection_pct })} tone={i.outstanding_cr > 0 ? "warn" : "good"} />
        </div>
        <Card title="Monthly calls, waiting & incidents" cap="Vessel calls and incidents per month across the terminal, with the average pre-berthing wait.">
          <TrendLine xKey="ym" suffix="" data={(d.monthly || []).map((m) => ({ ym: (m.ym || "").slice(2), calls: m.vessel_calls, waiting: m.avg_waiting_hr, incidents: m.incidents }))}
            lines={[{ key: "calls", name: t("Calls"), color: "var(--accent)" }, { key: "waiting", name: t("Avg wait (h)"), color: "var(--warn, var(--gold))" }, { key: "incidents", name: t("Incidents"), color: "var(--crit)" }]} />
        </Card>
      </>)}
      {sec === "revenue" && (<>
        <h2 className="ap-h">{t("Revenue & receivables")}</h2>
        <div className="grid kpis" style={{ marginBottom: 14 }}>
          <StatTile label="Outstanding" value={cr(i.outstanding_cr)} note={t("billed minus collected")} tone="crit" />
          <StatTile label="Collection rate" value={pct(i.collection_pct)} note={t("target 95%")} tone={i.collection_pct >= 95 ? "good" : "warn"} />
          <StatTile label="Cargo share of port" value={`${e.port_cargo_share_pct ?? "—"}%`} note={t("trailing 12 months")} />
        </div>
        <Card title="Monthly billing vs collection" cap="Billed, collected and the cumulative outstanding per month, this terminal.">
          <TrendLine xKey="ym" suffix="" data={(d.revenue_monthly || []).map((m) => ({ ym: (m.ym || "").slice(2), billed: m.billed_cr, collected: m.collected_cr, outstanding: m.outstanding_cr }))}
            lines={[{ key: "billed", name: t("Billed ₹Cr"), color: "var(--accent)" }, { key: "collected", name: t("Collected ₹Cr"), color: "var(--good)" }, { key: "outstanding", name: t("Outstanding ₹Cr"), color: "var(--crit)" }]} />
        </Card>
      </>)}
      {sec === "berths" && (<>
        <h2 className="ap-h">{t("Berths in this terminal")}</h2>
        <Card pad={false}>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{t("Berth")}</th><th>{t("Calls")}</th><th>{t("Cargo MT")}</th><th>{t("Avg wait")}</th><th>{t("Turnaround")}</th><th>{t("Occupancy")}</th><th>{t("Incidents")}</th><th>{t("Detentions")}</th></tr></thead>
            <tbody>{(d.berths || []).map((b) => (
              <tr key={b.berth}><td><RecordLink type="facility" id={b.berth} /></td>
                <td className="num">{fmtInt(b.vessel_calls)}</td><td className="num">{fmtInt(b.cargo_mt)}</td>
                <td className="num">{hrs(b.avg_waiting_hr)}</td><td className="num">{hrs(b.avg_turnaround_hr)}</td>
                <td className="num">{pct(b.occupancy_pct)}</td><td className="num">{fmtInt(b.incidents_total)}</td>
                <td className="num">{fmtInt(b.detentions)}</td></tr>))}
            </tbody></table></div>
        </Card>
        {d.worst_waiting && d.worst_waiting.length > 0 && (
          <Card title="Longest waits" cap="Berths with the highest average pre-berthing wait in this terminal." pad={false}>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>{t("Berth")}</th><th>{t("Avg wait")}</th><th>{t("Calls")}</th></tr></thead>
              <tbody>{(d.worst_waiting || []).map((b) => (
                <tr key={b.berth}><td><RecordLink type="facility" id={b.berth} /></td>
                  <td className="num" style={{ color: "var(--crit)" }}>{hrs(b.avg_waiting_hr)}</td>
                  <td className="num">{fmtInt(b.vessel_calls)}</td></tr>))}
              </tbody></table></div>
          </Card>
        )}
      </>)}
      {sec === "vessels" && (<>
        <h2 className="ap-h">{t("Vessels calling this terminal most")}</h2>
        <Card pad={false}>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{t("Vessel")}</th><th>{t("IMO")}</th><th>{t("Type")}</th><th>{t("Calls")}</th></tr></thead>
            <tbody>{(d.top_vessels || []).map((v) => (
              <tr key={v.imo}><td><RecordLink type="asset" id={v.imo}>{v.vessel}</RecordLink></td>
                <td className="mono">{v.imo}</td><td>{v.type}</td><td className="num">{fmtInt(v.calls)}</td></tr>))}
            </tbody></table></div>
        </Card>
      </>)}
      {sec === "agents" && (<>
        <h2 className="ap-h">{t("Shipping agents & cargo mix")}</h2>
        <div className="grid two">
          <Card title="Agents by calls handled">
            <DataTable columns={["Agent", "Calls"]} numeric={[1]}
              rows={(d.agents || []).map((a) => [a.agent, fmtInt(a.calls)])} />
          </Card>
          <Card title="Cargo mix" cap="Tonnes by commodity across the terminal's history.">
            <MiniBars items={(d.cargo_mix || []).map((c) => ({ name: c.cargo_type, v: Math.round((c.qty_mt || 0) / 1000) }))} suffix="k MT" />
          </Card>
        </div>
      </>)}
      {sec === "incidents" && (<>
        <h2 className="ap-h">{t("Recent incidents in this terminal")}</h2>
        <Card pad={false}>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>{t("Incident")}</th><th>{t("Title")}</th><th>{t("Severity")}</th><th>{t("Berth")}</th><th>{t("Status")}</th><th>{t("Reported")}</th></tr></thead>
            <tbody>{(d.incidents_recent || []).map((x) => (
              <tr key={x.incident}><td><RecordLink type="ticket" id={x.incident} /></td>
                <td>{x.title}</td><td>{x.severity}</td>
                <td>{x.berth ? <RecordLink type="facility" id={x.berth} /> : "—"}</td>
                <td>{x.status}</td><td>{dt(x.reported_at)}</td></tr>))}
            </tbody></table></div>
        </Card>
      </>)}
      {sec === "ai" && (<>
        <h2 className="ap-h">{t("AI terminal analyst")}</h2>
        {busy ? <Loading text={`Analysing ${dname}…`} />
          : brief ? (<><Card><Markdown>{brief}</Markdown></Card>
              <button className="btn" onClick={() => runBrief(1)}>{t("↻ Regenerate")}</button></>)
            : <button className="btn primary" onClick={() => runBrief()}>✦ {t("Generate the terminal brief")}</button>}
      </>)}
    </PortalShell>
  );
}
