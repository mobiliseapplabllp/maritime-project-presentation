import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Card, PageHeader, Loading, StatTile, DataTable, Hint, fmtInt } from "../components/ui.jsx";
import { MiniBars } from "../components/charts.jsx";
import Markdown from "../components/Markdown.jsx";
import MasterList from "../components/MasterList.jsx";
import { RecordLink } from "../components/RecordDrawer.jsx";
import { useLang } from "../lib/i18n.jsx";

const cr = (v) => (v == null ? "—" : "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " Cr");
const pct = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);
const hr = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}h`);

const VTYPE_LABEL = { CONT: "Container", BULK: "Dry bulk", TANK: "Tanker", GEN: "General cargo", RORO: "Ro-Ro" };

/* ---------- shared blocks ---------- */
function AIBrief({ section }) {
  const { lang, t } = useLang();
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const run = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api.get(`/sections/${section}/analysis`);
      setReport(r.report);
    } catch (e) { setErr(e.message || t("failed")); }
    setBusy(false);
  };
  // when the user switches language, re-generate an already-shown brief in that language
  useEffect(() => { if (report) run(); }, [lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ margin: "18px 0" }}>
      {!report && (
        <button className="btn primary" disabled={busy} onClick={run}>
          {busy ? t("Analysing…") : `✦ ${t("AI deep analysis")}`}
        </button>
      )}
      {err && <span style={{ color: "var(--crit)", marginLeft: 10, fontSize: 13 }}>{err}</span>}
      {report && <Card title="AI deep analysis" cap="Generated from this section's data, scoped to your role."><Markdown>{report}</Markdown></Card>}
    </div>
  );
}

function ViewToggle({ view, setView, listLabel }) {
  const { t } = useLang();
  return (
    <div style={{ display: "flex", gap: 6, margin: "0 0 14px" }}>
      <button className={`btn ${view === "analysis" ? "primary" : ""}`} onClick={() => setView("analysis")}>{t("Analysis")}</button>
      <button className={`btn ${view === "list" ? "primary" : ""}`} onClick={() => setView("list")}>{t(listLabel)}</button>
    </div>
  );
}

function useSection(id) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    api.get(`/sections/${id}`).then((d) => live && setData(d.data)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [id]);
  return { data, err };
}

/* ================= FLEET & VESSELS ================= */
export function FleetSection() {
  const { t } = useLang();
  const { data: d, err } = useSection("fleet");
  const [view, setView] = useState("analysis");
  if (err) return <Card>{err}</Card>;
  if (!d) return <Loading />;
  const k = d.kpis || {};
  if (view === "list") return (
    <>
      <PageHeader title="Vessel Register"
        sub="Every vessel that has called at Mundra — search by IMO, name, operator or agent; click an IMO to open the full vessel record." />
      <ViewToggle view={view} setView={setView} listLabel="Vessel Register" />
      <MasterList kind="assets" />
    </>
  );
  return (
    <>
      <PageHeader title="Fleet & Vessels — Deep Analysis"
        sub="The calling fleet: who comes to Mundra, how each vessel type performs at the berth, and which vessels the watchlist says to look at before they arrive again." />
      <ViewToggle view={view} setView={setView} listLabel="Vessel Register" />
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <StatTile label="Vessels on record" value={fmtInt(k.vessels)} note={t("distinct hulls seen at Mundra")} />
        <StatTile label="Liner callers" value={fmtInt(k.liner_callers)} note={t("scheduled services — never watchlisted")} tone="good" />
        <StatTile label="Vessel types" value={fmtInt((k.types || []).length)} note={(k.types || []).map((x) => VTYPE_LABEL[x] || x).join(" · ")} tone="accent" />
      </div>
      <AIBrief section="fleet" />
      <Card title="Reliability by vessel type" cap="Turnaround, incident intensity, PSC detention rate and findings per inspection — the type-level risk picture.">
        <DataTable columns={["Type", "Calls", "Avg turnaround", "Incidents / 100 calls", "Detention rate", "Findings / inspection"]}
          numeric={[1, 2, 3, 4, 5]}
          rows={(d.reliability || []).map((r) => [
            VTYPE_LABEL[r.vessel_type] || r.vessel_type, fmtInt(r.calls), hr(r.avg_turnaround_hr),
            r.incidents_per_100_calls, pct(r.detention_rate_pct), r.avg_findings_per_inspection])} />
      </Card>
      <Card title="Vessel watchlist — highest watch scores" cap="Incidents, inspection findings and detentions per call, blended into a watch score. Click an IMO for the full vessel portal.">
        <DataTable columns={["IMO", "Vessel", "Type", "Agent", "Calls", "Incidents", "Inspections", "Findings", "Detentions", "Watch score"]}
          numeric={[4, 5, 6, 7, 8, 9]}
          rows={(d.watchlist_top || []).map((w) => [
            <RecordLink type="asset" id={w.imo} />, w.vessel, VTYPE_LABEL[w.type] || w.type, w.agent,
            fmtInt(w.calls), fmtInt(w.incidents), fmtInt(w.inspections), fmtInt(w.findings), fmtInt(w.detentions), w.watch_score])} />
      </Card>
      <Hint>{t("The 8 documented liner callers are excluded from the watchlist by design — scheduled services are benchmarked, not policed. Watch scores refresh with every harvest cycle.")}</Hint>
    </>
  );
}

/* ================= INCIDENTS ================= */
export function IncidentsSection() {
  const { t } = useLang();
  const { data: d, err } = useSection("incidents");
  const [view, setView] = useState("analysis");
  if (err) return <Card>{err}</Card>;
  if (!d) return <Loading />;
  const k = d.kpis || {};
  const byYear = Object.entries(d.by_year || {}).map(([y, n]) => ({ name: y, v: n }));
  if (view === "list") return (
    <>
      <PageHeader title="Incident Register"
        sub="Every HSE and marine incident — search, filter by status or severity; click an incident number to open its record." />
      <ViewToggle view={view} setView={setView} listLabel="Incident Register" />
      <MasterList kind="tickets" />
    </>
  );
  return (
    <>
      <PageHeader title="Incidents — Deep Analysis"
        sub="The HSE stream: every incident on the port estate — spills, injuries, near-misses, security and equipment events — and how the close-out discipline is holding." />
      <ViewToggle view={view} setView={setView} listLabel="Incident Register" />
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <StatTile label="Incidents (all time)" value={fmtInt(k.total)} note={t("full history, all terminals")} />
        <StatTile label="High / critical" value={fmtInt(k.high_critical)} note={t("{p}% of the total", { p: k.total ? Math.round(100 * k.high_critical / k.total) : 0 })} tone="crit" />
        <StatTile label="Injuries" value={fmtInt(k.injuries)} note={t("people hurt — the number that matters most")} tone="crit" />
        <StatTile label="Spills" value={fmtInt(k.spills)} note={t("oil & cargo — environmental exposure")} tone="warn" />
      </div>
      <AIBrief section="incidents" />
      <Card title="Incidents by year" cap="Total incidents recorded each year. The mix (severity, terminal) matters more than the raw count — open the register for the detail.">
        <MiniBars items={byYear} suffix="" />
      </Card>
      <Hint>{t("High and critical incidents carry a root-cause-analysis duty. Open any incident from the register for its timeline, tasks, communications and similar past cases.")}</Hint>
    </>
  );
}

/* ================= INSPECTIONS & SURVEYS ================= */
export function InspectionsSection() {
  const { t } = useLang();
  const { data: d, err } = useSection("inspections");
  const [view, setView] = useState("analysis");
  if (err) return <Card>{err}</Card>;
  if (!d) return <Loading />;
  const k = d.kpis || {};
  if (view === "list") return (
    <>
      <PageHeader title="Inspection Register"
        sub="Every PSC / flag-state / ISM inspection and survey — click an inspection number or IMO to open the record." />
      <ViewToggle view={view} setView={setView} listLabel="Inspection Register" />
      <MasterList kind="pms" />
    </>
  );
  return (
    <>
      <PageHeader title="Inspections & Surveys — Deep Analysis"
        sub="The compliance stream: Port State Control, flag-state and ISM inspections on vessels calling at Mundra — findings raised, findings closed, and the detentions that follow when they aren't." />
      <ViewToggle view={view} setView={setView} listLabel="Inspection Register" />
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <StatTile label="Inspections done" value={fmtInt(k.done)} note={t("PSC · FSI · ISM · MLC, full history")} />
        <StatTile label="Findings raised" value={fmtInt(k.findings)} note={t("{n} per inspection on average", { n: k.done ? (k.findings / k.done).toFixed(1) : "—" })} tone="warn" />
        <StatTile label="Detentions" value={fmtInt(k.detentions)} note={t("Indian Ocean MoU benchmark ≈ 5.6%")} tone={k.detentions > 0 ? "crit" : "good"} />
      </div>
      <AIBrief section="inspections" />
      <Hint>{t("Open the register for each inspection's checklist summary, deficiency codes and due dates — and the vessel's full inspection history behind it.")}</Hint>
    </>
  );
}

/* ================= CERTIFICATES (statutory register) ================= */
const CERT_TONE = { VALID: "var(--good)", EXPIRING: "var(--warn, var(--gold))", EXPIRED: "var(--crit)" };

export function CertificatesSection() {
  const { t } = useLang();
  const [page, setPage] = useState(1);
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let live = true;
    api.get(`/records/cals?page=${page}`).then((x) => live && setD(x)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [page]);
  if (err) return <Card>{err}</Card>;
  if (!d) return <Loading />;
  if (d.available === false) return <Card>{t("The certificate register is not available yet — it appears after the next harvest cycle.")}</Card>;
  const rows = d.rows || [];
  const pages = Math.max(1, Math.ceil((d.total || 0) / (d.page_size || 50)));
  const nExpired = rows.filter((r) => r.status === "EXPIRED").length;
  const nExpiring = rows.filter((r) => r.status === "EXPIRING").length;
  return (
    <>
      <PageHeader title="Certificates — Statutory Register"
        sub="Every statutory certificate held by the vessels and seafarers on record — sorted by expiry, so what lapses next is always at the top. Expired paper stops ships and stops sign-ons." />
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <StatTile label="Certificates on register" value={fmtInt(d.total)} note={t("vessels + seafarers")} />
        <StatTile label="Expired (this page)" value={fmtInt(nExpired)} note={t("renewals overdue")} tone={nExpired ? "crit" : "good"} />
        <StatTile label="Expiring (this page)" value={fmtInt(nExpiring)} note={t("inside the renewal window")} tone={nExpiring ? "warn" : "good"} />
      </div>
      <Card pad={false} title="Register — soonest expiry first"
        cap="Click a holder to open the vessel or seafarer record. Status: VALID · EXPIRING (inside the renewal window) · EXPIRED.">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>
              <th>{t("Holder")}</th><th>{t("Held by")}</th><th>{t("Certificate")}</th><th>{t("Number")}</th>
              <th>{t("Issuer")}</th><th>{t("Issued")}</th><th>{t("Expiry")}</th><th>{t("Status")}</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.holder_type === "vessel"
                    ? <RecordLink type="asset" id={r.imo}>{r.holder}</RecordLink>
                    : <RecordLink type="employee" id={r.cdc_no}>{r.holder}</RecordLink>}</td>
                  <td>{r.holder_type === "vessel" ? t("Vessel") : t("Seafarer")} <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{r.imo || r.cdc_no}</span></td>
                  <td>{r.cert_type}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.number}</td>
                  <td>{r.issuer}</td>
                  <td>{r.issue_date}</td>
                  <td>{r.expiry_date}</td>
                  <td><b style={{ color: CERT_TONE[r.status] || "inherit" }}>{r.status}</b></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8}>{t("No certificates on this page.")}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="ml-pager">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("← Prev")}</button>
          <span>{t("page {p} of {n}", { p: page, n: fmtInt(pages) })}</span>
          <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("Next →")}</button>
        </div>
      </Card>
      <Hint>{t("Certificate lapses are a workflow signal — renewals sit with the Crewing Manager (seafarers) and the vessel's operator (ship certificates), not with the individual.")}</Hint>
    </>
  );
}

/* ================= REVENUE & RECEIVABLES ================= */
export function RevenueSection() {
  const { t } = useLang();
  const { data: d, err } = useSection("revenue");
  const [terms, setTerms] = useState(null);
  useEffect(() => {
    api.get("/records/districts?sort=outstanding").then((x) => setTerms(x.terminals || [])).catch(() => setTerms([]));
  }, []);
  if (err) return <Card>{err}</Card>;
  if (!d) return <Loading />;
  const k = d.kpis || {};
  return (
    <>
      <PageHeader title="Revenue & Receivables"
        sub="The money picture, end to end — port dues, berth hire and cargo charges billed, what has been collected, and where the outstanding sits by terminal." />
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <StatTile label="Billed" value={cr(k.billed_cr)} note={t("invoices raised, full history")} />
        <StatTile label="Collected" value={cr(k.collected_cr)} note={t("receipts against those invoices")} tone="good" />
        <StatTile label="Outstanding" value={cr(k.outstanding_cr)} note={t("billed minus collected, cumulative")} tone={k.outstanding_cr > 0 ? "crit" : "good"} />
        <StatTile label="Collection rate" value={pct(k.collection_pct)} note={t("target 95%")} tone={k.collection_pct >= 95 ? "good" : "warn"} />
      </div>
      <AIBrief section="revenue" />
      <Card title="Receivables by terminal" cap="Outstanding ₹Cr and collection rate per terminal — where the recovery effort should go first. Click a terminal for its full portal.">
        {!terms ? <Loading /> : (
          <DataTable columns={["Terminal", "Zone", "Calls (12m)", "Outstanding ₹Cr", "Collection %"]}
            numeric={[2, 3, 4]}
            rows={terms.map((r) => [
              <RecordLink type="district" id={r.terminal}>{r.name}</RecordLink>, r.zone,
              fmtInt(r.calls_12m), r.outstanding_cr, pct(r.collection_pct)])} />
        )}
      </Card>
      <Hint>{t("Revenue recovery actions can be raised as work orders on the Finance Controller and the terminal's manager — ask Sagar Intelligence for the top debtors first.")}</Hint>
    </>
  );
}

/* ================= CREW & MANNING ================= */
export function CrewSection() {
  const { t } = useLang();
  const { data: d, err } = useSection("crew");
  if (err) return <Card>{err}</Card>;
  if (!d) return <Loading />;
  const k = d.kpis || {};
  return (
    <>
      <PageHeader title="Crew & Manning — Deep Analysis"
        sub="The seafarers on record: who is onboard, whose certificates are lapsing, and the sea-service history behind every CDC number." />
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <StatTile label="Seafarers on record" value={fmtInt(k.seafarers)} note={t("CDC holders in the register")} />
        <StatTile label="Currently onboard" value={fmtInt(k.onboard)} note={t("signed on a vessel right now")} tone="accent" />
        <StatTile label="Certificates expired" value={fmtInt(k.cert_expired)} note={t("blocks sign-on until renewed")} tone={k.cert_expired ? "crit" : "good"} />
      </div>
      <AIBrief section="crew" />
      <Hint>{t("Open the Certificates register for every expiry by date, or click any seafarer from a certificate row to see their full record — certificates, sea service and vessels served.")}</Hint>
    </>
  );
}
