import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useLang } from "../lib/i18n.jsx";

function prettyKey(k) {
  return k.replace(/_/g, " ").replace(/\bpct\b/gi, "%").replace(/\bpp\b/g, "pp");
}

function EvidenceValue({ v }) {
  if (v == null) return <span className="mono">—</span>;
  if (Array.isArray(v)) {
    // array of scalars, or array of [name, value...] rows
    if (v.length && Array.isArray(v[0])) {
      return (
        <div className="tbl-wrap" style={{ marginTop: 6 }}>
          <table className="tbl">
            <tbody>
              {v.slice(0, 12).map((row, i) => (
                <tr key={i}>
                  {row.map((c, j) => (
                    <td key={j} className={typeof c === "number" ? "num" : ""}>
                      {typeof c === "number" ? Number(c).toLocaleString("en-IN") : String(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return <span className="mono">{v.map(String).join(", ")}</span>;
  }
  if (typeof v === "object") {
    return (
      <div style={{ marginTop: 4 }}>
        {Object.entries(v).map(([k, val]) => (
          <div key={k} className="mono" style={{ fontSize: 12 }}>
            <span style={{ color: "var(--muted)" }}>{prettyKey(k)}:</span>{" "}
            {typeof val === "number" ? Number(val).toLocaleString("en-IN") : String(val)}
          </div>
        ))}
      </div>
    );
  }
  return (
    <span className="mono">
      {typeof v === "number" ? Number(v).toLocaleString("en-IN") : String(v)}
    </span>
  );
}

function Section({ label, children }) {
  return (
    <div className="fd-section">
      <div className="fd-section-h">{label}</div>
      <div className="fd-section-b">{children}</div>
    </div>
  );
}

export default function FindingDetail({ finding, onClose }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const [woBusy, setWoBusy] = useState(false);
  const [woDone, setWoDone] = useState(null);

  const createWO = async () => {
    setWoBusy(true);
    try {
      const o = await api.woCreate({ finding_id: finding.id });
      setWoDone(o.id);
    } catch (e) { alert(e.message); }
    setWoBusy(false);
  };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const d = finding.detail || {};
  const ev = finding.evidence || {};

  return (
    <div className="fd-overlay" onClick={onClose}>
      <div className="fd-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={`fd-head ${finding.severity}`}>
          <div className="f-top">
            <span className={`pill ${finding.severity}`}>{t(finding.severity)}</span>
            <span className="pill area">{finding.area.replace("_", " ")}</span>
            <span className="f-id">{t("Finding")} {finding.id}</span>
            <button className="fd-x" onClick={onClose} aria-label={t("Close")}>×</button>
          </div>
          <h2 className="fd-title">{finding.title}</h2>
        </div>

        <div className="fd-body">
          <Section label={t("What this means")}>
            <p>{d.what || finding.inference}</p>
          </Section>

          {Object.keys(ev).length > 0 && (
            <Section label={t("Evidence — straight from the data")}>
              <div className="fd-evgrid">
                {Object.entries(ev).map(([k, v]) => (
                  <div className="fd-ev" key={k}>
                    <div className="fd-ev-k">{prettyKey(k)}</div>
                    <div className="fd-ev-v"><EvidenceValue v={v} /></div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <div className="fd-two">
            <Section label={t("Data source")}>
              <p>{d.source}</p>
            </Section>
            <Section label={t("How the analysis was done")}>
              <p>{d.method}</p>
            </Section>
          </div>

          <Section label={t("AI / ML contribution")}>
            <p>{d.ai_role}</p>
          </Section>

          <Section label={t("What it implies · what it predicts")}>
            <p>{d.implication}</p>
          </Section>
        </div>

        <div className="fd-foot">
          <span className="mono">{t("Sagar Drishti analysis engine")} · {finding.id}</span>
          <button className="btn" onClick={onClose}>{t("Close")}</button>
        </div>
      </div>
    </div>
  );
}
