import React, { useState } from "react";
import { getToken } from "../lib/api.js";
import { useLang } from "../lib/i18n.jsx";

/* Download-PDF / Email / Print for any dashboard. kind = port|zone|terminal|berth|crew|vessel. */
export default function ReportActions({ kind, scope }) {
  const { t } = useLang();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const qs = `kind=${encodeURIComponent(kind)}${scope ? `&scope=${encodeURIComponent(scope)}` : ""}`;

  const download = async () => {
    setBusy("pdf"); setMsg("");
    try {
      const res = await fetch(`/api/reports/pdf?${qs}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${kind}${scope ? "_" + scope : ""}.pdf`.replace(/[^\w.-]+/g, "_");
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    } catch (e) { setMsg(t("PDF failed — try again.")); }
    setBusy("");
  };

  const email = async () => {
    const to = window.prompt(t("Email this report to (address):"), "");
    if (!to || !to.includes("@")) return;
    setBusy("email"); setMsg("");
    try {
      const r = await fetch("/api/reports/email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ kind, scope, to }),
      });
      const d = await r.json();
      setMsg(d.ok ? t("Emailed to {to} ✓", { to }) : t("Email failed: {detail}", { detail: d.detail || t("unknown") }));
    } catch (e) { setMsg(t("Email failed — try again.")); }
    setBusy("");
  };

  return (
    <div className="report-actions" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "2px 0 16px" }}>
      <button className="btn" disabled={busy === "pdf"} onClick={download} title={t("AI report as a branded PDF")}>
        {busy === "pdf" ? t("Preparing PDF…") : t("⭳ Download PDF")}
      </button>
      <button className="btn" disabled={busy === "email"} onClick={email} title={t("Generate the report and email it (with PDF attached)")}>
        {busy === "email" ? t("Sending…") : t("✉ Email report")}
      </button>
      <button className="btn" onClick={() => window.print()} title={t("Print / Save as PDF from the browser")}>{t("🖨 Print")}</button>
      {busy && <span style={{ fontSize: 12, color: "var(--muted)" }}>{t("the AI brief takes a few seconds…")}</span>}
      {msg && <span style={{ fontSize: 12.5, color: msg.includes("✓") ? "var(--good)" : "var(--crit)" }}>{msg}</span>}
    </div>
  );
}
