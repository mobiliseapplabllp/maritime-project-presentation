import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Card, Loading, fmtInt } from "./ui.jsx";
import { RecordLink } from "./RecordDrawer.jsx";
import { useLang } from "../lib/i18n.jsx";

const dwt = (v) => (v == null ? "—" : fmtInt(v));

const CONFIGS = {
  assets: {
    endpoint: "/records/assets", recordType: "asset", idKey: "imo",
    placeholder: "Search IMO, vessel, operator or agent…",
    filters: [
      { key: "vtype", label: "Type", opts: ["", "CONT", "BULK", "TANK", "GEN", "RORO"],
        labels: { CONT: "Container", BULK: "Dry bulk", TANK: "Tanker", GEN: "General cargo", RORO: "Ro-Ro" } },
      { key: "tier", label: "DWT band", opts: ["", "lt50k", "50to150k", "gt150k"],
        labels: { lt50k: "< 50k DWT", "50to150k": "50–150k DWT", gt150k: "> 150k DWT" } },
      { key: "watch", label: "Watchlist", opts: ["", "1"], labels: { 1: "Watchlisted only" } },
      { key: "sort", label: "Sort", opts: ["calls", "incidents", "watch", "dwt", "imo"],
        labels: { calls: "Most calls", incidents: "Most incidents", watch: "Highest watch score", dwt: "Largest (DWT)", imo: "IMO" } },
    ],
    columns: ["IMO", "Vessel", "Type", "Flag", "Operator", "DWT", "Terminal", "Calls", "Incidents", "Watch score"],
    row: (r) => [
      <RecordLink type="asset" id={r.imo} />, r.vessel, r.type || "—", r.flag,
      r.operator, dwt(r.dwt), r.terminal || "—", fmtInt(r.calls), fmtInt(r.incidents),
      r.watch_score != null ? r.watch_score : (r.liner ? "liner" : "—")],
  },
  tickets: {
    endpoint: "/records/tickets", recordType: "ticket", idKey: "incident",
    placeholder: "Search incident no, title, vessel or berth…",
    filters: [
      { key: "status", label: "Status", opts: ["", "OPEN", "MONITORING", "CLOSED"],
        labels: { OPEN: "Open", MONITORING: "Monitoring", CLOSED: "Closed" } },
      { key: "severity", label: "Severity", opts: ["", "CRITICAL", "HIGH", "MEDIUM", "LOW"],
        labels: { CRITICAL: "Critical", HIGH: "High", MEDIUM: "Medium", LOW: "Low" } },
      { key: "sort", label: "Sort", opts: ["recent", "slowest", "severity"],
        labels: { recent: "Most recent", slowest: "Slowest to close", severity: "Most severe" } },
    ],
    columns: ["Incident", "Title", "Severity", "Berth", "Terminal", "Vessel", "Reported", "Close time", "Assigned to"],
    row: (r) => [
      <RecordLink type="ticket" id={r.incident} />, (r.title || "").slice(0, 60), r.severity,
      r.berth ? <RecordLink type="facility" id={r.berth} /> : "—", r.terminal || "—",
      r.vessel || "—", String(r.reported_at || "").slice(0, 10),
      r.close_hr != null ? `${r.close_hr}h` : r.status, r.assigned_to || "—"],
  },
  pms: {
    endpoint: "/records/pms", recordType: "pm", idKey: "inspection",
    placeholder: "Search inspection no, IMO, vessel or inspector…",
    filters: [
      { key: "status", label: "Status", opts: ["", "PLANNED", "IN_PROGRESS", "CLOSED"],
        labels: { PLANNED: "Planned", IN_PROGRESS: "In progress", CLOSED: "Closed" } },
      { key: "itype", label: "Type", opts: ["", "PSC", "FSI", "ISM", "MLC"],
        labels: { PSC: "Port State Control", FSI: "Flag State", ISM: "ISM audit", MLC: "MLC" } },
      { key: "sort", label: "Sort", opts: ["recent"], labels: { recent: "Most recent" } },
    ],
    columns: ["Inspection", "Type", "Vessel", "IMO", "Inspector", "Planned", "Closed", "Result", "Findings", "Detention"],
    row: (r) => [
      <RecordLink type="pm" id={r.inspection} />, r.type,
      r.vessel, <RecordLink type="asset" id={r.imo} />, r.inspector || "—",
      String(r.planned_at || "").slice(0, 10), String(r.closed_at || "").slice(0, 10) || "—",
      r.result || r.status, `${fmtInt(r.findings)} (${fmtInt(r.findings_closed)} closed)`,
      r.detention ? "⚠ YES" : "—"],
  },
};

export default function MasterList({ kind }) {
  const { t } = useLang();
  const cfg = CONFIGS[kind];
  const [q, setQ] = useState("");
  const [qLive, setQLive] = useState("");
  const [filters, setFilters] = useState({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => { const t = setTimeout(() => { setQ(qLive); setPage(1); }, 350); return () => clearTimeout(t); }, [qLive]);
  useEffect(() => {
    if (!cfg) return;
    let live = true;
    const ps = new URLSearchParams({ q, page: String(page), ...filters });
    api.get(`${cfg.endpoint}?${ps}`).then((d) => live && setData(d)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [kind, q, page, JSON.stringify(filters)]);

  if (!cfg) return null;
  if (err) return <Card>{err}</Card>;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <Card pad={false}>
      <div className="ml-bar">
        <input className="ml-search" value={qLive} onChange={(e) => setQLive(e.target.value)}
          placeholder={t(cfg.placeholder)} />
        {cfg.filters.map((f) => (
          <select key={f.key} className="sel" value={filters[f.key] || ""}
            onChange={(e) => { setFilters({ ...filters, [f.key]: e.target.value }); setPage(1); }}>
            {f.opts.map((o) => <option key={o} value={o}>{o === "" ? t("All — {label}", { label: t(f.label) }) : t(f.labels?.[o] || o)}</option>)}
          </select>
        ))}
        <span className="ml-count">{data ? t("{n} records", { n: fmtInt(data.total) }) : ""}</span>
      </div>
      {!data ? <Loading /> : (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr>{cfg.columns.map((c) => <th key={c}>{t(c)}</th>)}</tr></thead>
            <tbody>
              {data.rows.map((r, i) => <tr key={i}>{cfg.row(r).map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}
              {!data.rows.length && <tr><td colSpan={cfg.columns.length}>{t("No records match.")}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div className="ml-pager">
        <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t("← Prev")}</button>
        <span>{t("page {p} of {n}", { p: page, n: fmtInt(pages) })}</span>
        <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t("Next →")}</button>
      </div>
    </Card>
  );
}
