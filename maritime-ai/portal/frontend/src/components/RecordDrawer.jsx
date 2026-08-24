import React, { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import Markdown from "./Markdown.jsx";
import { fmtInt } from "./ui.jsx";
import { useLang } from "../lib/i18n.jsx";

const DrawerCtx = createContext({ openRecord: () => {}, closeDrawer: () => {} });
export const useDrawer = () => useContext(DrawerCtx);

const dt = (v) => (v ? String(v).slice(0, 16).replace("T", " ") : "—");

export function DrawerProvider({ children }) {
  const [rec, setRec] = useState(null); // {type, id}
  const openRecord = (type, id) => setRec({ type, id: String(id) });
  const close = () => setRec(null);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  return (
    <DrawerCtx.Provider value={{ openRecord, closeDrawer: close }}>
      {children}
      {rec && <RecordDrawer type={rec.type} id={rec.id} onClose={close} />}
    </DrawerCtx.Provider>
  );
}

// Route ids are the engine's record types (asset=vessel, ticket=incident,
// pm=inspection, employee=seafarer, facility=berth, district=terminal) —
// only the labels changed in the re-domain, never the paths.
export function RecordLink({ type, id, children }) {
  const { openRecord, closeDrawer } = useDrawer();
  const nav = useNavigate();
  const onClick = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (type === "asset") { closeDrawer(); nav(`/asset/${id}`); }            // full portals
    else if (type === "employee") { closeDrawer(); nav(`/employee/${id}`); }
    else if (type === "facility") { closeDrawer(); nav(`/facility/${encodeURIComponent(id)}`); }
    else if (type === "district") { closeDrawer(); nav(`/district/${encodeURIComponent(id)}`); }
    else openRecord(type, id);                                                // slider for incidents/inspections
  };
  return <a href="#" className="rec-link" onClick={onClick}>{children || id}</a>;
}

const TABS = {
  ticket: ["AI Brief", "Incident", "Timeline & tasks", "Vessel & berth", "Similar cases", "Comms"],
  pm: ["AI Brief", "Inspection", "Findings", "Vessel record"],
};

function RecordDrawer({ type, id, onClose }) {
  const { lang, t } = useLang();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState(TABS[type]?.[1] || "Overview");
  const [brief, setBrief] = useState(null);
  const [briefBusy, setBriefBusy] = useState(false);

  useEffect(() => {
    setData(null); setErr(""); setBrief(null);
    setTab(TABS[type]?.[1] || "Overview");
    api.get(`/records/${type}/${encodeURIComponent(id).replace(/%2F/g, "/")}`)
      .then(setData).catch((e) => setErr(e.message || "load failed"));
  }, [type, id]);

  const runBrief = async () => {
    setBriefBusy(true);
    try {
      const r = await api.get(`/records/analysis/${type}/${encodeURIComponent(id).replace(/%2F/g, "/")}`);
      setBrief(r.report);
    } catch (e) { setBrief(`_${e.message || "analysis unavailable"}_`); }
    setBriefBusy(false);
  };

  // re-generate an already-shown brief in the newly selected language
  useEffect(() => { if (brief) runBrief(); }, [lang]);   // eslint-disable-line react-hooks/exhaustive-deps

  const head = headOf(type, data);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <div className="drawer-id">◈ {head.id}</div>
            <div className="drawer-title">{head.title}</div>
            <div className="drawer-sub">{head.sub}</div>
          </div>
          <button className="btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="drawer-tabs">
          {(TABS[type] || []).map((t) => (
            <button key={t} className={`dtab ${tab === t ? "on" : ""}`}
              onClick={() => { setTab(t); if (t === "AI Brief" && !brief && !briefBusy) runBrief(); }}>{t}</button>
          ))}
        </div>
        <div className="drawer-body">
          {err && <div className="drawer-err">{err}</div>}
          {!data && !err && <div className="drawer-loading">{t("Loading record…")}</div>}
          {data && tab === "AI Brief" && (
            briefBusy ? <div className="drawer-loading">{t("Sagar Intelligence is analysing this record…")}</div>
              : brief ? <Markdown>{brief}</Markdown>
                : <button className="btn primary" onClick={runBrief}>✦ {t("Generate AI brief")}</button>
          )}
          {data && tab !== "AI Brief" && <TabBody type={type} tab={tab} d={data} />}
        </div>
      </aside>
    </>
  );
}

function headOf(type, d) {
  if (!d) return { id: "…", title: "", sub: "" };
  if (type === "ticket") {
    const i = d.incident;
    return { id: i.incident, title: i.title || `${i.category || ""} incident`,
             sub: `${i.berth || i.terminal || "port"} · ${i.severity} · ${i.status}` };
  }
  const p = d.inspection || {};
  return { id: p.inspection, title: `${p.type || ""} — ${p.vessel || ""}`,
           sub: `${p.berth || p.terminal || "—"} · ${p.result || p.status || ""}` };
}

function KV({ k, v }) {
  return <div className="kv"><span>{k}</span><b>{v == null || v === "" ? "—" : String(v)}</b></div>;
}

function TabBody({ type, tab, d }) {
  const { t } = useLang();
  /* ---------------- INCIDENT ---------------- */
  if (type === "ticket") {
    const i = d.incident, tl = d.timeline || {};
    if (tab === "Incident") return (
      <>
        <div className="kv-grid">
          <KV k="Incident" v={i.incident} /><KV k="Category" v={`${i.category || "—"} · ${i.type || ""}`} />
          <KV k="Severity" v={`${i.severity} · ${i.priority || ""}`} /><KV k="Status" v={i.status} />
          <KV k="Berth" v={i.berth} /><KV k="Terminal / zone" v={`${i.terminal || "—"} / ${i.zone || "—"}`} />
          <KV k="Vessel" v={i.vessel} />
          <KV k="Reported by" v={`${i.reported_by || "—"} · via ${i.source || "—"}`} />
          <KV k="Injuries" v={fmtInt(i.injuries)} />
          {i.pollution_tier != null && i.pollution_tier !== "" && <KV k="Pollution tier" v={i.pollution_tier} />}
          {i.weather && <KV k="Weather" v={i.weather} />}
          {i.outcome && <KV k="Outcome" v={i.outcome} />}
        </div>
        {i.description && <p className="dnote">{String(i.description).slice(0, 400)}</p>}
        {d.rca && (d.rca.rootCause || d.rca.correctiveAction) && (
          <div className="kv-grid" style={{ marginTop: 8 }}>
            <KV k="Root cause" v={d.rca.rootCause} />
            <KV k="Corrective action" v={d.rca.correctiveAction} />
            <KV k="Preventive action" v={d.rca.preventiveAction} />
          </div>
        )}
      </>);
    if (tab === "Timeline & tasks") return (
      <>
        <div className="kv-grid">
          <KV k="Reported" v={dt(tl.reported_at)} />
          <KV k="Acknowledged" v={`${dt(tl.acknowledged_at)} (${tl.response_hr ?? "—"}h response)`} />
          <KV k="Resolved" v={dt(tl.resolved_at)} />
          <KV k="Closed" v={`${dt(tl.closed_at)} (${tl.close_hr ?? "—"}h total)`} />
        </div>
        <p className="dnote">{d.closure_rule}</p>
        <table className="dtable"><thead><tr><th>{t("Task")}</th><th>{t("Assignee")}</th><th>{t("Due")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>{(d.tasks || []).length ? d.tasks.map((x, i2) => (
            <tr key={i2}><td>{x.title}</td><td>{x.assignee || "—"}</td><td>{dt(x.due)}</td>
              <td>{x.status}{x.done_at ? ` · ${dt(x.done_at)}` : ""}</td></tr>))
            : <tr><td colSpan="4">{t("No tasks raised on this incident.")}</td></tr>}
          </tbody></table>
      </>);
    if (tab === "Vessel & berth") return (
      <>
        <div className="kv-grid">
          {d.vessel ? (<>
            <KV k="Vessel" v={<RecordLink type="asset" id={d.vessel.imo}>{d.vessel.vessel}</RecordLink>} />
            <KV k="Type / agent" v={`${d.vessel.type || "—"} · ${d.vessel.agent || "—"}`} />
            <KV k="Calls at Mundra" v={fmtInt(d.vessel.calls)} />
            <KV k="Vessel's total incidents" v={fmtInt(d.vessel.total_incidents)} />
            <KV k="PSC detentions" v={fmtInt(d.vessel.detentions)} />
          </>) : <KV k="Vessel" v="none — shore-side incident" />}
          <KV k="Berth" v={i.berth ? <RecordLink type="facility" id={i.berth} /> : "—"} />
          {d.sequence_at_berth != null && <KV k="Incident # at this berth" v={d.sequence_at_berth} />}
          {d.assigned && <KV k="Assigned officer" v={`${d.assigned.name} · ${fmtInt(d.assigned.incidents_assigned)} assigned · ${d.assigned.closed_pct ?? "—"}% closed`} />}
        </div>
        <p className="dnote">{t("Open the vessel for its full portal (calls, inspections, certificates, watch score) or the berth for its record.")}</p>
      </>);
    if (tab === "Similar cases") {
      const sc = d.similar_cases || {};
      return (
        <>
          <p className="dnote">{t("Same incident family — median close-out is")}
            <b> {sc.family_median_close_hr ?? "—"}h</b> {t("across {n} closed cases. This incident:", { n: fmtInt(sc.family_closed_n) })} <b>{tl.close_hr ?? "—"}h</b>.</p>
          <table className="dtable"><thead><tr><th>{t("Incident")}</th><th>{t("Berth")}</th><th>{t("Severity")}</th><th>{t("Close time")}</th></tr></thead>
            <tbody>{(sc.recent || []).map((x) => (
              <tr key={x.incident}><td><RecordLink type="ticket" id={x.incident} /></td>
                <td>{x.berth || "—"}</td><td>{x.severity}</td><td>{x.close_hr != null ? `${x.close_hr}h` : "—"}</td></tr>))}
            </tbody></table>
        </>);
    }
    if (tab === "Comms") return (
      <table className="dtable"><thead><tr><th>{t("When")}</th><th>{t("Who")}</th><th>{t("Channel")}</th><th>{t("Message")}</th></tr></thead>
        <tbody>{(d.comms || []).length ? d.comms.map((c, i2) => (
          <tr key={i2}><td style={{ whiteSpace: "nowrap" }}>{dt(c.at)}</td><td>{c.by}</td>
            <td className="mono" style={{ fontSize: 11 }}>{c.channel} {c.direction}</td><td>{c.message}</td></tr>))
          : <tr><td colSpan="4">{t("No communications on record.")}</td></tr>}
        </tbody></table>);
  }

  /* ---------------- INSPECTION ---------------- */
  if (type === "pm") {
    const p = d.inspection;
    if (tab === "Inspection") return (
      <>
        <div className="kv-grid">
          <KV k="Inspection" v={`${p.inspection} · ${p.type}`} />
          <KV k="Vessel" v={<RecordLink type="asset" id={p.imo}>{p.vessel}</RecordLink>} />
          <KV k="Type / agent" v={`${p.vessel_type || "—"} · ${p.agent || "—"}`} />
          <KV k="Call / berth" v={`${p.vcn || "—"} · ${p.berth || "—"} (${p.terminal || "—"})`} />
          <KV k="Inspector" v={p.inspector} />
          <KV k="Planned" v={dt(p.planned_at)} /><KV k="Closed" v={dt(p.closed_at)} />
          <KV k="Status / result" v={`${p.status} · ${p.result || "—"}`} />
          <KV k="Detention" v={p.detention ? "⚠ YES — vessel detained" : "no"} />
          {p.remarks && <KV k="Remarks" v={p.remarks} />}
        </div>
        {d.checklist_summary && (
          <p className="dnote">{t("Checklist: {n} items", { n: fmtInt(d.checklist_summary.items) })}
            {" · "}{Object.entries(d.checklist_summary.by_answer || {}).map(([k, v]) => `${k}: ${v}`).join(" · ")}
            {(d.checklist_summary.flagged || []).length ? ` · ${t("flagged")}: ${d.checklist_summary.flagged.join(", ")}` : ""}</p>
        )}
        {d.detention_context && <p className="dnote">{d.detention_context.note} ({t("benchmark detention rate")} {d.detention_context.detention_benchmark_pct}%)</p>}
      </>);
    if (tab === "Findings") return (
      <>
        <table className="dtable"><thead><tr><th>{t("Code")}</th><th>{t("Deficiency")}</th><th>{t("Due")}</th><th>{t("Status")}</th></tr></thead>
          <tbody>{(d.findings || []).length ? d.findings.map((f, i2) => (
            <tr key={i2}><td className="mono">{f.deficiency_code}</td><td>{f.description}</td>
              <td>{dt(f.due_date)}</td><td>{f.status}{f.closed_at ? ` · ${dt(f.closed_at)}` : ""}</td></tr>))
            : <tr><td colSpan="4">{t("No deficiencies recorded — clean inspection.")}</td></tr>}
          </tbody></table>
        {d.inspection_effect && (
          <div className="kv-grid" style={{ marginTop: 10 }}>
            <KV k="Closed inspections on this vessel" v={fmtInt(d.inspection_effect.closed_inspections)} />
            <KV k="Incidents within 90d after a closed inspection" v={fmtInt(d.inspection_effect.incidents_90d_after_closed)} />
            <KV k="Findings still open" v={fmtInt(d.inspection_effect.open_findings)} />
          </div>
        )}
      </>);
    if (tab === "Vessel record") return (
      <>
        <p className="dnote">{t("This vessel:")} <b>{fmtInt(d.vessel_compliance?.findings_closed)} of {fmtInt(d.vessel_compliance?.findings)}</b> {t("findings closed ({p}%) across {n} inspections · {d} detention(s).", { p: d.vessel_compliance?.closure_pct ?? "—", n: fmtInt(d.vessel_compliance?.inspections), d: fmtInt(d.vessel_compliance?.detentions) })}</p>
        <table className="dtable"><thead><tr><th>{t("Inspection")}</th><th>{t("Type")}</th><th>{t("Planned")}</th><th>{t("Result")}</th><th>{t("Findings")}</th><th>{t("Detention")}</th></tr></thead>
          <tbody>{(d.vessel_history || []).map((h) => (
            <tr key={h.inspection}><td>{h.inspection}</td><td>{h.type}</td><td>{dt(h.planned_at)}</td>
              <td>{h.result || h.status}</td><td>{fmtInt(h.findings)}</td><td>{h.detention ? "⚠" : "—"}</td></tr>))}
          </tbody></table>
      </>);
  }
  return null;
}
