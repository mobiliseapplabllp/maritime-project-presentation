import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { Card, PageHeader, Loading, StatTile, Hint, fmtInt } from "../components/ui.jsx";
import { TrendLine } from "../components/charts.jsx";
import { useLang } from "../lib/i18n.jsx";

const VTONE = { PASS: "var(--good)", PARTIAL: "var(--gold)", FAIL: "var(--crit)", SKIP: "var(--muted)" };

export default function TrainingLog() {
  const { t } = useLang();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null);
  const [running, setRunning] = useState(false);

  const load = () => api.get("/agents/qa").then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      await fetch("/api/agents/qa/run", { method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("sagar_token") || ""}` } });
    } catch (e) {}
    setTimeout(() => { load(); setRunning(false); }, 4000);
  };

  if (err) return <Card>{err}</Card>;
  if (!d) return <Loading text="Loading training log…" />;
  const v = d.by_verdict || {};
  const graded = (v.PASS || 0) + (v.PARTIAL || 0) + (v.FAIL || 0);

  return (
    <>
      <PageHeader title="Training Log — Examiner & Validator"
        sub="The permanent record of the chatbot's self-testing loop: every question the QA Examiner asked as Mundra Port leadership would, whether the answer survived independent database verification, and every correction that now steers the assistant." />

      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <StatTile label="Questions tested" value={fmtInt(d.questions_tested)} note={t("{n} cycles run", { n: fmtInt(d.cycles_recorded) })} />
        <StatTile label="Correct (PASS)" value={fmtInt(v.PASS || 0)} note={graded ? t("{pct}% of graded answers", { pct: Math.round(100 * (v.PASS || 0) / graded) }) : "—"} tone="good" />
        <StatTile label="Partial" value={fmtInt(v.PARTIAL || 0)} note="right direction, imprecise" tone="warn" />
        <StatTile label="Failed" value={fmtInt(v.FAIL || 0)} note="materially wrong — corrected" tone="crit" />
        <StatTile label="Corrections applied" value={fmtInt(d.corrections_made)} note="lessons now injected into every chat & voice answer" tone="accent" />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button className="btn primary" disabled={running} onClick={runNow}>{running ? t("Cycle starting…") : t("▶ Run a cycle now")}</button>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
          {t("Schedule: every {m} min · {q} questions/cycle · {s} · auto-refreshes every minute", {
            m: d.config?.interval_minutes, q: d.config?.questions_per_cycle,
            s: d.config?.enabled ? t("enabled") : t("paused"),
          })}
        </span>
      </div>

      {(d.cycles || []).length >= 2 && (
        <Card title="Pass rate by cycle" cap="Share of each cycle's answers that survived independent SQL verification. Expect this to climb as corrections accumulate.">
          <TrendLine xKey="ym" data={(d.cycles || []).map((c) => ({ ym: (c.cycle || "").slice(-4), rate: c.pass_rate }))}
            lines={[{ key: "rate", name: t("Pass rate %"), color: "var(--accent)" }]}
            refs={[{ y: 80, label: t("Target 80%"), color: "var(--gold)" }]} />
        </Card>
      )}

      <Card title="Validation record" cap="Newest first. Click a row for the expected truth, the correction, and the verification queries the Validator ran." pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th></th><th>{t("When")}</th><th>{t("Question")}</th><th>{t("Answered via")}</th><th>{t("Verdict")}</th><th>{t("Score")}</th></tr></thead>
            <tbody>
              {(d.recent || []).map((r, i) => (
                <React.Fragment key={i}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setOpen(open === i ? null : i)}>
                    <td>{open === i ? "▾" : "▸"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{String(r.t || "").slice(5, 16).replace("T", " ")}</td>
                    <td>{r.question}</td>
                    <td className="mono" style={{ fontSize: 11 }}>{r.answer_source}</td>
                    <td><b style={{ color: VTONE[r.verdict] || "inherit" }}>{r.verdict}</b></td>
                    <td className="num">{r.score ?? "—"}</td>
                  </tr>
                  {open === i && (
                    <tr><td /><td colSpan={5} style={{ background: "var(--panel, rgba(127,127,127,.05))" }}>
                      <div style={{ padding: "10px 6px", fontSize: 12.5, display: "grid", gap: 8 }}>
                        <div><b>{t("Chatbot answered:")}</b> {r.answer_head}…</div>
                        {r.expected && <div><b>{t("Ground truth:")}</b> {r.expected}</div>}
                        {r.correction && <div style={{ color: "var(--crit)" }}><b>{t("Correction:")}</b> {r.correction}</div>}
                        {(r.ground_truth || []).map((g, j) => (
                          <div key={j} className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                            SQL: {g.query} → {g.error ? t("error: {e}", { e: g.error }) : t("{n} rows", { n: g.rowcount })}
                          </div>))}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <h3 style={{ margin: "24px 0 10px", fontSize: 16 }}>{t("Corrections now steering the assistant ({n})", { n: fmtInt(d.corrections_made) })}</h3>
      {(d.lessons || []).length ? (
        <div className="grid cards">
          {(d.lessons || []).slice(0, 12).map((l, i) => (
            <Card key={i} title={String(l.t || "").slice(0, 16).replace("T", " ")} cap={l.question}>
              <p style={{ fontSize: 13, margin: 0 }}><b>{t("Lesson:")}</b> {l.lesson}</p>
              {l.correction && <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "8px 0 0" }}>{l.correction}</p>}
            </Card>
          ))}
        </div>
      ) : <Hint>{t("No corrections yet — every answer has passed so far.")}</Hint>}
    </>
  );
}
