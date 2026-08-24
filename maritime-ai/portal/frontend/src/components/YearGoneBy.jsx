import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { Loading, fmtInt } from "./ui.jsx";
import { useLang } from "../lib/i18n.jsx";

const cr = (v) => (v == null ? "—" : "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " Cr");

/* ---------- procedural uplifting pad loop (no assets, no licensing) ---------- */
function makeMusic() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.1;
  master.connect(ctx.destination);
  const chords = [[261.6, 329.6, 392.0], [196.0, 246.9, 392.0], [220.0, 261.6, 329.6], [174.6, 220.0, 349.2]];
  let step = 0;
  const bar = () => {
    const notes = chords[step % 4];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = f / 2;
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.5 / (i + 1), ctx.currentTime + 0.7);
      g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 3.9);
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctx.currentTime + 4);
    });
    const s = ctx.createOscillator(), sg = ctx.createGain();
    s.type = "sine";
    s.frequency.value = notes[step % 3] * 2;
    sg.gain.setValueAtTime(0.06, ctx.currentTime + 1.2);
    sg.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.8);
    s.connect(sg); sg.connect(master);
    s.start(ctx.currentTime + 1.2); s.stop(ctx.currentTime + 2.9);
    step++;
  };
  bar();
  const timer = setInterval(bar, 4000);
  return { stop() { clearInterval(timer); try { ctx.close(); } catch (e) {} } };
}

function useCountUp(target, active, dur = 1500) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active || target == null) return;
    let raf, t0;
    const stepFn = (ts) => {
      if (!t0) t0 = ts;
      const p = Math.min(1, (ts - t0) / dur);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(stepFn);
    };
    raf = requestAnimationFrame(stepFn);
    return () => cancelAnimationFrame(raf);
  }, [active, target]);
  return v;
}

function Big({ n, active, fmt = fmtInt, suffix = "" }) {
  const v = useCountUp(typeof n === "number" ? n : 0, active);
  return <div className="ygb-big">{fmt(v)}{suffix}</div>;
}

function Podium({ items, metric }) {
  return (
    <div className="ygb-podium">
      {items.map((it, i) => (
        <div key={i} className={`ygb-step s${i}`}>
          <div className="ygb-medal">{["🥇", "🥈", "🥉"][i]}</div>
          <div className="ygb-name">{it.name}</div>
          <div className="ygb-sub">{it.sub}</div>
          <div className="ygb-metric">{metric(it)}</div>
        </div>
      ))}
    </div>
  );
}

export default function YearGoneBy() {
  const { t } = useLang();
  const [year, setYear] = useState(2025);
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [music, setMusic] = useState(false);
  const musicRef = useRef(null);

  useEffect(() => {
    setD(null); setScene(0);
    api.get(`/yearbook/${year}`).then(setD).catch((e) => setErr(e.message));
  }, [year]);

  useEffect(() => () => { musicRef.current?.stop(); }, []);
  const toggleMusic = () => {
    if (music) { musicRef.current?.stop(); musicRef.current = null; setMusic(false); }
    else { musicRef.current = makeMusic(); setMusic(true); }
  };

  const s = d?.stats, nr = d?.narrative || {};
  const scenes = useMemo(() => {
    if (!s) return [];
    const yl = s.partial ? t("{year} — so far", { year }) : `${year}`;
    const tr = s.traffic || {}, inc = s.incidents || {}, insp = s.inspections || {},
          sv = s.services || {}, rev = s.revenue || {};
    return [
      { id: "opening", accent: "#2dd4bf", eyebrow: t("THE YEAR GONE BY"), body: (a) => (<>
          <div className="ygb-title">{yl}</div>
          <div className="ygb-cap">{nr.opening || t("A year of working {n} MMT of cargo over the berths of Mundra — this is the story of {year} in numbers.", { n: tr.cargo_mmt, year: yl })}</div>
        </>) },
      { id: "volume", accent: "#2dd4bf", eyebrow: t("THE TRAFFIC"), body: (a) => (<>
          <Big n={tr.calls} active={a} />
          <div className="ygb-lbl">{t("vessel calls worked")}</div>
          <div className="ygb-row3">
            <div><b>{tr.cargo_mmt} MMT</b><span>{t("cargo handled")}</span></div>
            <div><b>{fmtInt(tr.teu)}</b><span>{t("TEU moved")}</span></div>
            <div><b>{fmtInt(tr.vessels_seen)}</b><span>{t("distinct vessels")}</span></div>
          </div>
          <div className="ygb-cap">{nr.volume || t("Busiest month: {month} — {n} calls, {mt} MT over the quay.", { month: s.busiest_month?.ym, n: fmtInt(s.busiest_month?.calls), mt: fmtInt(s.busiest_month?.cargo_mt) })}</div>
        </>) },
      { id: "speed", accent: "#4ade80", eyebrow: t("THE SERVICE"), body: (a) => (<>
          <Big n={tr.avg_turnaround_hr} active={a} fmt={(v) => v} suffix="h" />
          <div className="ygb-lbl">{t("average turnaround, arrival to sailing")}</div>
          <div className="ygb-row3">
            <div><b>{t("{n}h", { n: tr.avg_waiting_hr })}</b><span>{t("avg anchorage wait")}</span></div>
            <div><b>{tr.berthed_lt6h_pct}%</b><span>{t("berthed within 6 hours")}</span></div>
            <div><b>{fmtInt(sv.pilotage_moves)}</b><span>{t("pilotage moves")}</span></div>
          </div>
          <div className="ygb-cap">{nr.speed || ""}</div>
        </>) },
      { id: "money", accent: "#fbbf24", eyebrow: t("THE MONEY"), body: (a) => (<>
          <Big n={rev.billed_cr || 0} active={a} fmt={(v) => cr(v)} />
          <div className="ygb-lbl">{t("billed across {n} invoices", { n: fmtInt(rev.invoices || 0) })}</div>
          <div className="ygb-row3">
            <div><b>{cr(rev.collected_cr)}</b><span>{t("collected")}</span></div>
            <div><b>{rev.collection_pct}%</b><span>{t("collection rate")}</span></div>
            {s.vs_previous_year?.cargo_mmt != null && <div><b>{tr.cargo_mmt >= s.vs_previous_year.cargo_mmt ? "▲" : "▼"} {Math.abs((tr.cargo_mmt || 0) - s.vs_previous_year.cargo_mmt).toFixed(2)} MMT</b><span>{t("cargo vs {year}", { year: year - 1 })}</span></div>}
          </div>
          <div className="ygb-cap">{nr.money || ""}</div>
        </>) },
      { id: "safety", accent: "#fb7185", eyebrow: t("SAFETY — HONESTLY"), body: (a) => (<>
          <Big n={inc.incidents || 0} active={a} />
          <div className="ygb-lbl">{t("incidents recorded — {n} high or critical", { n: fmtInt(inc.high_critical || 0) })}</div>
          <div className="ygb-row3">
            <div><b>{fmtInt(inc.injuries || 0)}</b><span>{t("injuries")}</span></div>
            <div><b>{fmtInt(inc.spills || 0)}</b><span>{t("spills")}</span></div>
            <div><b>{fmtInt(insp.detentions || 0)}</b><span>{t("PSC detentions ({n} inspections)", { n: fmtInt(insp.done || 0) })}</span></div>
          </div>
          <div className="ygb-cap">{s.incidents_worst_month?.ym ? t("Heaviest month: {month} with {n} incidents.", { month: s.incidents_worst_month.ym, n: fmtInt(s.incidents_worst_month.incidents) }) : ""}</div>
        </>) },
      { id: "heroterm", accent: "#facc15", eyebrow: t("TERMINALS OF THE YEAR"), body: () => (<>
          <Podium items={(s.best_terminals || []).map((f) => ({ name: f.terminal, sub: "", ...f }))}
            metric={(f) => t("{w}h wait · {ta}h turnaround · {n} calls", { w: f.avg_waiting_hr, ta: f.avg_turnaround_hr, n: fmtInt(f.calls) })} />
          <div className="ygb-cap">{nr.heroes_terminals || t("Shortest waits with meaningful volume — the benchmark the rest of the port can copy.")}</div>
        </>) },
      { id: "attnterm", accent: "#fb923c", eyebrow: t("NEEDING ATTENTION"), body: () => (<>
          <Podium items={(s.attention_terminals || []).map((f) => ({ name: f.terminal, sub: "", ...f }))}
            metric={(f) => t("{n} incidents · {h} high/crit · {i} injuries", { n: fmtInt(f.incidents), h: fmtInt(f.high_critical), i: fmtInt(f.injuries) })} />
          <div className="ygb-cap">{nr.attention_terminals || t("Where the incidents concentrated — the fastest place to win next year.")}</div>
        </>) },
      { id: "heroagents", accent: "#facc15", eyebrow: t("AGENTS OF THE YEAR"), body: () => (<>
          <Podium items={(s.top_agents || []).map((e) => ({ name: e.agent, sub: "", ...e }))}
            metric={(e) => t("{n} calls handled", { n: fmtInt(e.calls) })} />
          <div className="ygb-cap">{nr.heroes_agents || t("The shipping agents who moved the most calls through the port.")}</div>
        </>) },
      { id: "workhorse", accent: "#a78bfa", eyebrow: t("THE WORKHORSES"), body: () => (<>
          <Podium items={(s.workhorse_vessels || []).map((e) => ({ name: e.vessel, sub: `${e.type} · IMO ${e.imo}`, ...e }))}
            metric={(e) => t("{n} calls this year", { n: fmtInt(e.calls) })} />
          <div className="ygb-cap">{nr.workhorses || t("The hulls that kept coming back — the backbone of the trade.")}</div>
        </>) },
      { id: "vessel", accent: "#fb7185", eyebrow: t("VESSEL OF THE YEAR (NOT IN A GOOD WAY)"), body: (a) => (<>
          <Big n={s.worst_vessel?.incidents || 0} active={a} />
          <div className="ygb-lbl">{t("incidents from one vessel — {v}", { v: s.worst_vessel?.vessel || "—" })}</div>
          <div className="ygb-cap">{nr.vessel || t("The watchlist conversation before her next call is the honest one.")}</div>
        </>) },
      { id: "closing", accent: "#2dd4bf", eyebrow: t("ONWARD"), body: () => (<>
          <div className="ygb-title" style={{ fontSize: 42 }}>{s.partial ? t("The year is still being written.") : t("That was {year}.", { year })}</div>
          <div className="ygb-cap">{nr.closing || t("Same port, sharper tools — the AI now watches every call, every berth, every rupee.")}</div>
        </>) },
    ];
  }, [s, nr, year, t]);

  useEffect(() => {
    if (!playing || !scenes.length) return;
    const t = setTimeout(() => setScene((x) => (x + 1) % scenes.length), 7000);
    return () => clearTimeout(t);
  }, [playing, scene, scenes.length]);

  if (err) return <div className="ygb-wrap"><Loading text={err} /></div>;
  if (!d) return <div className="ygb-wrap"><Loading text="Composing the year…" /></div>;
  const sc = scenes[scene];

  return (
    <div>
      <div className="ygb-bar">
        {(d.years_available || [2023, 2024, 2025, 2026]).map((y) => (
          <button key={y} className={`btn ${y === year ? "primary" : ""}`} onClick={() => setYear(y)}>
            {y === new Date().getFullYear() ? t("{year} (so far)", { year: y }) : y}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={toggleMusic}>{music ? t("🔊 Music on") : t("🔇 Music")}</button>
        <button className="btn" onClick={() => setPlaying(!playing)}>{playing ? t("⏸ Pause") : t("▶ Play")}</button>
      </div>
      <div className="ygb-wrap" style={{ "--ygb-accent": sc?.accent }}
        onClick={() => setScene((scene + 1) % scenes.length)}>
        <div className="ygb-progress">
          {scenes.map((x, i) => (
            <div key={i} className={`ygb-seg ${i < scene ? "done" : ""} ${i === scene ? "on" : ""}`}
              onClick={(e) => { e.stopPropagation(); setScene(i); }} />
          ))}
        </div>
        <div className="ygb-eyebrow">{sc?.eyebrow}</div>
        <div className="ygb-body" key={scene}>{sc?.body(true)}</div>
        <div className="ygb-hint">{t("tap to advance")} · {scene + 1}/{scenes.length}{d.narrative ? "" : ` · ✨ ${t("AI captions are being written and will appear on next view")}`}</div>
      </div>
    </div>
  );
}
