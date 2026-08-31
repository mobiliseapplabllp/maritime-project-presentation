import React, { useState } from "react";
import FindingDetail from "./FindingDetail.jsx";
import ExplainModal from "./ExplainModal.jsx";
import { useLang } from "../lib/i18n.jsx";

export function StatTile({ label, value, note, tone = "accent", explain = true }) {
  const [open, setOpen] = useState(false);
  const { t } = useLang();
  // translate plain-string labels/notes; leave pre-built JSX or interpolated output alone
  const lab = typeof label === "string" ? t(label) : label;
  const nt = typeof note === "string" ? t(note) : note;
  const tile = (
    <div className="card kpi" style={{ maxWidth: 300 }}>
      <div className={`stripe s-${tone}`} />
      <div className="lab">{lab}</div>
      <div className="val">{value}</div>
      {note && <div className="note">{nt}</div>}
    </div>
  );
  return (
    <div className="card kpi">
      <div className={`stripe s-${tone}`} />
      {explain && (
        <button className="kpi-explain" title="Sagar Intelligence explains this figure"
          onClick={() => setOpen(true)}>✨ AI</button>
      )}
      <div className="lab">{lab}</div>
      <div className="val">{value}</div>
      {note && <div className="note">{nt}</div>}
      {open && (
        <ExplainModal title={typeof label === "string" ? label : ""} caption={typeof note === "string" ? note : ""}
          data={{ shown_value: String(value) }} preview={tile} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

export function Card({ title, cap, children, className = "", pad = true, explain = true, explainData = null }) {
  const [showExplain, setShowExplain] = useState(false);
  const { t } = useLang();
  const canExplain = explain && !!title;
  return (
    <div className={`card ${pad ? "" : "pad0"} ${className}`}>
      {title && (
        <div className="card-title-row">
          <div className="card-title">{t(title)}</div>
          {canExplain && (
            <button className="explain-btn" title="Sagar Intelligence explains this in plain language"
              onClick={() => setShowExplain(true)}>
              ✨ {t("AI explain")}
            </button>
          )}
        </div>
      )}
      {cap && <div className="card-cap">{t(cap)}</div>}
      {children}
      {showExplain && (
        <ExplainModal title={title} caption={cap} data={explainData}
          preview={<div className={pad ? "" : "explain-prev-pad0"}>{children}</div>}
          onClose={() => setShowExplain(false)} />
      )}
    </div>
  );
}

export function FindingCard({ f }) {
  const [open, setOpen] = useState(false);
  const [explain, setExplain] = useState(false);
  const { t } = useLang();
  const preview = (
    <div className={`card finding ${f.severity}`} style={{ boxShadow: "none" }}>
      <div className="f-top">
        <span className={`pill ${f.severity}`}>{t(f.severity)}</span>
        <span className="pill area">{f.area.replace("_", " ")}</span>
        <span className="f-id">{f.id}</span>
      </div>
      <div className="f-title">{f.title}</div>
      <div className="f-infer">{f.inference}</div>
    </div>
  );
  return (
    <>
      <div className={`card finding clickable ${f.severity}`} onClick={() => setOpen(true)}
        role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}>
        <div className="f-top">
          <span className={`pill ${f.severity}`}>{t(f.severity)}</span>
          <span className="pill area">{f.area.replace("_", " ")}</span>
          <span className="f-id">{f.id}</span>
        </div>
        <div className="f-title">{f.title}</div>
        <div className="f-infer">{f.inference}</div>
        <div className="f-foot">
          <span className="f-more">{t("Read full report →")}</span>
          <button className="kpi-explain f-explain" title="Sagar Intelligence explains this finding in plain language"
            onClick={(e) => { e.stopPropagation(); setExplain(true); }}>✨ AI</button>
        </div>
      </div>
      {open && <FindingDetail finding={f} onClose={() => setOpen(false)} />}
      {explain && (
        <ExplainModal
          title={f.title}
          caption={f.inference}
          data={{ finding_id: f.id, area: f.area, severity: f.severity, evidence: f.evidence }}
          preview={preview} page="/findings"
          onClose={() => setExplain(false)} />
      )}
    </>
  );
}

export function DataTable({ columns, rows, numeric = [] }) {
  const { t } = useLang();
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>{columns.map((c, i) => <th key={i}>{typeof c === "string" ? t(c) : c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={numeric.includes(j) ? "num" : ""}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PageHeader({ title, sub }) {
  const { t } = useLang();
  return (
    <>
      <h1 className="page-h">{t(title)}</h1>
      {sub && <p className="page-sub">{t(sub)}</p>}
    </>
  );
}

export function Loading({ text = "Loading data…" }) {
  const { t } = useLang();
  return <div className="loading">{t(text)}</div>;
}

export function Hint({ children }) {
  const { t } = useLang();
  return <div className="hint">{typeof children === "string" ? t(children) : children}</div>;
}

export function fmtInt(n) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN");
}
