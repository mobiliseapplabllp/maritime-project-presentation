import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { PageHeader, Card, Loading } from "../components/ui.jsx";
import Markdown from "../components/Markdown.jsx";
import { useLang } from "../lib/i18n.jsx";

const STATUS_LABEL = { idle: "Idle", queued: "Queued", running: "Running", done: "Active", error: "Error", skipped: "Skipped", disabled: "Disabled" };

const MODEL_LABEL = { haiku: "Swift (fast)", sonnet: "Core (balanced)", opus: "Deep (most capable)" };

function fmtTime(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" }); }
  catch (e) { return iso; }
}
function clock(iso) {
  try { return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch (e) { return ""; }
}

const KIND_CLASS = {
  alert: "ev-warn", flag: "ev-warn", escalation: "ev-crit", error: "ev-crit",
  insight: "ev-accent", action: "ev-accent", done: "ev-good", start: "ev-good",
  handoff: "ev-muted", work: "ev-muted",
};

// render **bold** spans inline without a full markdown block (keeps <ol>/<li> structure)
function inlineBold(text) {
  const clean = text.replace(/^\d+[.)]\s*/, "");
  return clean.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**")
      ? <strong key={i}>{seg.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{seg}</React.Fragment>
  );
}

function Switch({ on, onChange, disabled }) {
  return (
    <button type="button" className={`switch ${on ? "on" : ""}`} disabled={disabled}
      onClick={() => onChange(!on)} aria-checked={on} role="switch">
      <span className="knob" />
    </button>
  );
}

// Agent display names arrive from /api/agents (Harbour Collector, Berth Sentinel,
// Marine Auditor, Berth Planner, Trade Analyst, Duty Officer, Facts Curator,
// QA Examiner, QA Validator) and are rendered through t() for hi/gu.
const PIPELINE = ["collector", "sentinel", "auditor", "planner", "analyst"];

function OrchestrationStrip({ meta, cycleAgents }) {
  const { t } = useLang();
  const byId = {};
  (meta.agents || []).forEach((a) => { byId[a.id] = a; });
  const cfg = meta.config || {};
  return (
    <div className="orch-strip">
      <div className="orch-super">
        <span className="orch-super-ic">⌘</span> {t("Duty Officer")} <span className="orch-super-sub">{t("orchestrates · routes hand-offs · escalates")}</span>
      </div>
      <div className="orch-flow">
        {PIPELINE.map((aid, i) => {
          const a = byId[aid] || {};
          const en = (cfg.agents?.[aid]?.enabled) !== false;
          const st = cycleAgents?.[aid]?.status;
          return (
            <React.Fragment key={aid}>
              {i > 0 && <span className={`orch-arrow ${en ? "" : "off"}`}>→</span>}
              <div className={`orch-node ${en ? "" : "off"} ${st === "running" ? "running" : ""}`}>
                <span className="orch-ic">{a.icon}</span>
                <span className="orch-name">{t(a.name || aid)}</span>
                {!en && <span className="orch-off-tag">{t("off")}</span>}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function ConfigPanel({ config, onSaved, onClose }) {
  const { t } = useLang();
  const [cfg, setCfg] = useState(() => JSON.parse(JSON.stringify(config)));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (path, value) => {
    setCfg((c) => {
      const n = JSON.parse(JSON.stringify(c));
      let o = n;
      for (let i = 0; i < path.length - 1; i++) o = o[path[i]] = o[path[i]] || {};
      o[path[path.length - 1]] = value;
      return n;
    });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.saveAgentConfig(cfg);
      setCfg(r.config);
      setSaved(true);
      onSaved(r.config, r.next_run);
    } catch (e) { /* keep panel open */ }
    setSaving(false);
  };

  const sc = cfg.schedule || {};
  const ag = cfg.agents || {};
  const AGENT_META = [
    ["collector", "Harbour Collector", false],
    ["sentinel", "Berth Sentinel", false],
    ["auditor", "Marine Auditor", true],
    ["planner", "Berth Planner", true],
    ["analyst", "Trade Analyst", true],
  ];

  return (
    <div className="card cfg-panel">
      <div className="cfg-head">
        <div>
          <div className="card-title">{t("Agent configuration")}</div>
          <div className="card-cap">{t("Controls the autonomous schedule, each agent's behaviour, and escalation. Changes apply from the next cycle.")}</div>
        </div>
        <button className="btn" onClick={onClose}>✕ {t("Close")}</button>
      </div>

      <div className="cfg-grid">
        <div className="cfg-section">
          <div className="cfg-sec-title">{t("Orchestration schedule")}</div>
          <div className="cfg-row">
            <span>{t("Autonomous cycles")}</span>
            <Switch on={sc.enabled !== false} onChange={(v) => set(["schedule", "enabled"], v)} />
          </div>
          <div className="cfg-row">
            <span>{t("Frequency")}</span>
            <select className="cfg-select" value={sc.mode || "daily"}
              onChange={(e) => set(["schedule", "mode"], e.target.value)}>
              <option value="daily">{t("Daily at a fixed hour")}</option>
              <option value="interval">{t("Every N hours")}</option>
            </select>
          </div>
          {(sc.mode || "daily") === "daily" ? (
            <div className="cfg-row">
              <span>{t("Run at")}</span>
              <select className="cfg-select" value={sc.hour ?? 7}
                onChange={(e) => set(["schedule", "hour"], Number(e.target.value))}>
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="cfg-row">
              <span>{t("Interval")}</span>
              <select className="cfg-select" value={sc.interval_hours ?? 6}
                onChange={(e) => set(["schedule", "interval_hours"], Number(e.target.value))}>
                {[1, 3, 6, 12, 24].map((h) => <option key={h} value={h}>{t("every {h}h", { h })}</option>)}
              </select>
            </div>
          )}
          <div className="cfg-row">
            <span>{t("Escalate high-severity to a human")}</span>
            <Switch on={cfg.escalation?.enabled !== false} onChange={(v) => set(["escalation", "enabled"], v)} />
          </div>
        </div>

        <div className="cfg-section">
          <div className="cfg-sec-title">{t("Agents")}</div>
          {AGENT_META.map(([aid, name, hasModel]) => (
            <div className="cfg-agent" key={aid}>
              <div className="cfg-row">
                <span className="cfg-agent-name">{t(name)}</span>
                <Switch on={ag[aid]?.enabled !== false} onChange={(v) => set(["agents", aid, "enabled"], v)} />
              </div>
              {hasModel && ag[aid]?.enabled !== false && (
                <div className="cfg-row sub">
                  <span>{t("Reasoning engine")}</span>
                  <select className="cfg-select" value={ag[aid]?.model || "sonnet"}
                    onChange={(e) => set(["agents", aid, "model"], e.target.value)}>
                    {Object.entries(MODEL_LABEL).map(([m, l]) => <option key={m} value={m}>{t(l)}</option>)}
                  </select>
                </div>
              )}
              {aid === "sentinel" && ag.sentinel?.enabled !== false && (
                <>
                  <div className="cfg-row sub">
                    <span>{t("Alert sensitivity")} <em>{t("(lower = more alerts)")}</em></span>
                    <span className="cfg-slider-wrap">
                      <input type="range" min="1.5" max="5" step="0.1"
                        value={ag.sentinel?.sensitivity ?? 2.5}
                        onChange={(e) => set(["agents", "sentinel", "sensitivity"], Number(e.target.value))} />
                      <b>×{(ag.sentinel?.sensitivity ?? 2.5).toFixed(1)}</b>
                    </span>
                  </div>
                  <div className="cfg-row sub">
                    <span>{t("Min waiting shift to alert")}</span>
                    <select className="cfg-select" value={ag.sentinel?.min_threshold_hr ?? 2}
                      onChange={(e) => set(["agents", "sentinel", "min_threshold_hr"], Number(e.target.value))}>
                      {[1, 1.5, 2, 3, 4, 6].map((h) => <option key={h} value={h}>{t("{h}h", { h })}</option>)}
                    </select>
                  </div>
                </>
              )}
              {aid === "planner" && ag.planner?.enabled !== false && (
                <div className="cfg-row sub">
                  <span>{t("Max actions per cycle")}</span>
                  <select className="cfg-select" value={ag.planner?.max_actions ?? 6}
                    onChange={(e) => set(["agents", "planner", "max_actions"], Number(e.target.value))}>
                    {[3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="cfg-foot">
        {saved && <span className="cfg-saved">{t("✓ Saved — applies from the next cycle")}</span>}
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </div>
    </div>
  );
}

export default function Agents() {
  const { t } = useLang();
  const [meta, setMeta] = useState(null);          // /api/agents (cards + schedule + config)
  const [cycle, setCycle] = useState(null);        // the cycle being shown (cached or live)
  const [running, setRunning] = useState(false);
  const [live, setLive] = useState(false);         // showing a live run
  const [showCfg, setShowCfg] = useState(false);
  const poll = useRef(null);
  const feedRef = useRef(null);

  const loadMeta = () => api.agents().then(setMeta).catch(() => {});

  useEffect(() => {
    loadMeta();
    api.lastCycle().then((d) => { if (d.cycle) setCycle(d.cycle); }).catch(() => {});
    return () => { if (poll.current) clearInterval(poll.current); };
  }, []);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [cycle]);

  const runCycle = async () => {
    if (running) return;
    setRunning(true); setLive(true);
    setCycle({ status: "running", events: [], agents: {}, brief: "" });
    try {
      const { run_id } = await api.runAgents();
      poll.current = setInterval(async () => {
        try {
          const r = await api.runStatus(run_id);
          setCycle(r);
          if (r.status === "done" || r.status === "error") {
            clearInterval(poll.current); poll.current = null;
            setRunning(false); loadMeta();
          }
        } catch (e) { clearInterval(poll.current); setRunning(false); }
      }, 1400);
    } catch (e) {
      setRunning(false);
      setCycle({ status: "error", events: [{ t: "", agent: "supervisor", kind: "error", text: e.message }], agents: {} });
    }
  };

  if (!meta) return <Loading text="Loading the agent workforce…" />;

  const A = (cycle && cycle.agents) || {};
  const sentinel = A.sentinel || {};
  const auditor = A.auditor || {};
  const planner = A.planner || {};
  const brief = (cycle && cycle.brief) || "";

  return (
    <div className="agents-page">
      <div className="asst-head-row">
        <PageHeader
          title="Agent Operations"
          sub="A team of autonomous agents keeps the operations picture fresh and actionable — rebuilding the panels each cycle from the port snapshot, watching anchorage waits per terminal, auditing marine service, planning berth and recovery actions, and briefing leadership. They run every 2 hours on their own; you can also run a cycle live below."
        />
        <div className="agents-actions">
          <button className="btn" onClick={() => setShowCfg((v) => !v)}>
            ⚙ Configure
          </button>
          <button className="btn primary focus-btn" onClick={runCycle} disabled={running}>
            {running ? t("Cycle running…") : `▷ ${t("Run a cycle now")}`}
          </button>
        </div>
      </div>

      <div className="asst-status" style={{ marginBottom: 14 }}>
        <span className={`dot ${meta.schedule.enabled ? "on" : ""}`} />
        Autonomous schedule:{" "}
        <b>
          &nbsp;{!meta.schedule.enabled ? "paused"
            : meta.schedule.mode === "interval" ? `every ${meta.schedule.interval_hours}h`
            : `daily at ${String(meta.schedule.hour).padStart(2, "0")}:00`}
        </b>
        {meta.schedule.enabled && meta.schedule.next_run && <>&nbsp;· next run {fmtTime(meta.schedule.next_run)}</>}
        {live && cycle && <>&nbsp;· <b>&nbsp;live cycle {cycle.status === "running" ? "in progress…" : cycle.status}</b></>}
        {!live && cycle && <>&nbsp;· showing last cycle {fmtTime(cycle.finished_at || cycle.started_at)}</>}
      </div>

      <OrchestrationStrip meta={meta} cycleAgents={cycle && cycle.agents} />

      {showCfg && meta.config && (
        <ConfigPanel
          config={meta.config}
          onClose={() => setShowCfg(false)}
          onSaved={() => loadMeta()}
        />
      )}

      {/* Agent cards */}
      <div className="grid agent-grid">
        {meta.agents.map((a) => {
          const acfg = meta.config?.agents?.[a.id];
          const isOff = acfg && acfg.enabled === false;
          const st = isOff ? "disabled" : (A[a.id] && A[a.id].status) || "idle";
          const liveSummary = A[a.id] && A[a.id].summary;
          const toggle = async (v) => {
            try {
              await api.saveAgentConfig({ agents: { [a.id]: { enabled: v } } });
              loadMeta();
            } catch (e) {}
          };
          return (
            <div key={a.id} className={`card agent-card ${st}`}>
              <div className="agent-top">
                <span className="agent-ic">{a.icon}</span>
                <div>
                  <div className="agent-name">{t(a.name)}</div>
                  <div className="agent-role">{a.role}</div>
                </div>
                <span className={`agent-badge ${st}`}>{st === "running" && <i className="spin" />}{t(STATUS_LABEL[st] || st)}</span>
              </div>
              <div className="agent-desc">{a.desc}</div>
              <div className="agent-foot">
                {isOff ? "Disabled — will be skipped in the next cycle." : (liveSummary || a.last_summary || "Awaiting first run.")}
              </div>
              {a.id === "sentinel" && a.baseline && !isOff && (
                <div className="agent-learned">{t("🧠 learned threshold:")} <b>{a.baseline.threshold_hr}h</b> ({t("baseline move")} {a.baseline.mean_abs_delta}h)</div>
              )}
              <div className="agent-card-foot">
                {a.last_run ? <span className="agent-lastrun">last run {fmtTime(a.last_run)} · {a.runs} cycles</span> : <span />}
                {a.id !== "supervisor" && (
                  <Switch on={!isOff} onChange={toggle} disabled={running} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {cycle && (
        <div className="grid two" style={{ marginTop: 20, alignItems: "start" }}>
          {/* Activity feed */}
          <Card title="Live activity feed" cap="What each agent did this cycle, in order, with hand-offs." pad>
            <div className="agent-feed" ref={feedRef}>
              {(cycle.events || []).length === 0 && <div className="agent-feed-empty">{t("Waiting for the cycle to start…")}</div>}
              {(cycle.events || []).map((e, i) => (
                <div key={i} className={`feed-ev ${KIND_CLASS[e.kind] || ""}`}>
                  <span className="feed-t">{clock(e.t)}</span>
                  <span className="feed-agent">{e.agent}</span>
                  <span className="feed-text">{e.text}</span>
                </div>
              ))}
              {cycle.status === "running" && <div className="feed-ev ev-muted"><span className="typing"><i /><i /><i /></span></div>}
            </div>
          </Card>

          {/* Results */}
          <div className="grid" style={{ gap: 16 }}>
            {cycle.escalation && <div className="escalation-banner">{cycle.escalation}</div>}

            {sentinel.alerts && sentinel.alerts.length > 0 && (
              <Card title={`Sentinel alerts (${sentinel.alerts.length})`} cap="Waiting-time shifts per terminal above the learned threshold (hours).">
                {sentinel.alerts.map((al, i) => (
                  <div key={i} className={`alert-row ${al.severity}`}>
                    <span className={`pill ${al.severity}`}>{al.severity}</span>
                    {al.terminal && <b style={{ marginRight: 6 }}>{al.terminal}</b>}
                    {al.text}
                    {al.threshold_hr != null && <span className="mono" style={{ marginLeft: 6, fontSize: 11, color: "var(--muted)" }}>thr {al.threshold_hr}h</span>}
                  </div>
                ))}
              </Card>
            )}

            {auditor.worst && auditor.worst.length > 0 && (
              <Card title={`Auditor — marine service scores`} cap={`Avg ${auditor.metrics?.avg_credibility ?? "—"}/100 · lowest-scoring terminals flagged for review.`}>
                {auditor.note && <div className="auditor-note">{auditor.note}</div>}
                <div className="cred-list">
                  {auditor.worst.map((w, i) => (
                    <div key={i} className="cred-row">
                      <span className="cred-name">{w.terminal ?? w.district ?? w.name}</span>
                      <span className="cred-bar"><span style={{ width: `${w.score}%` }} className={w.score < 40 ? "lo" : w.score < 65 ? "mid" : "hi"} /></span>
                      <span className="cred-score mono">{w.score}/100</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {planner.actions && planner.actions.length > 0 && (
              <Card title="Planner — prioritised actions" cap="For the duty team, drafted from this cycle's signals — tug/pilot cover, berth windows, dues to chase.">
                <ol className="action-list">
                  {planner.actions.map((ac, i) => <li key={i}>{inlineBold(ac)}</li>)}
                </ol>
              </Card>
            )}

            {brief && (
              <Card title="Trade Analyst — cycle brief">
                <Markdown>{brief}</Markdown>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
