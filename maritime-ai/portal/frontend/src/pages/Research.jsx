import React, { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { useLang } from "../lib/i18n.jsx";
import { Card, PageHeader, Loading, Hint } from "../components/ui.jsx";
import Markdown from "../components/Markdown.jsx";

const fmtWhen = (ts) => (ts ? String(ts).slice(0, 16).replace("T", " ").replace(" ", " · ") : "");
// article sources come from a web-grounded AI run — only ever link http(s) URLs
const safeUrl = (u) => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);

function Article({ a, open, onToggle }) {
  const { t } = useLang();
  const srcs = (a.sources || []).filter((s) => safeUrl(s.url));
  return (
    <Card pad={true} className="ri-article">
      <div className="ri-head" onClick={onToggle} style={{ cursor: onToggle ? "pointer" : "default" }}>
        <div>
          <div className="ri-date mono">{fmtWhen(a.created_at)}</div>
          <h3 className="ri-title">{a.title}</h3>
        </div>
        {onToggle && <span className="ri-chev">{open ? "▾" : "▸"}</span>}
      </div>
      {open && (
        <>
          <Markdown>{a.body_md}</Markdown>
          {srcs.length > 0 && (
            <div className="ri-sources">
              <div className="ds-sec-h">{t("Sources")}</div>
              <ul>
                {srcs.map((s, i) => (
                  <li key={i}><a href={safeUrl(s.url)} target="_blank" rel="noreferrer">{s.title || s.url}</a></li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function IntelFeed({ topic, runLabel }) {
  const { user } = useAuth();
  const [arts, setArts] = useState(null);
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState("");
  const [openId, setOpenId] = useState(null);
  const autoOpened = useRef(false);       // open the top article once, not on every poll
  const wasRunning = useRef(false);

  const load = () => {
    api.get(`/research/${topic}`).then((d) => {
      setArts(d.articles);
      if (d.articles.length && !autoOpened.current) {
        autoOpened.current = true;
        setOpenId(d.articles[0].id);
      }
    }).catch(() => setArts([]));
    api.get("/research/status").then((d) => setStatus(d.status?.[topic])).catch(() => {});
  };
  useEffect(() => { autoOpened.current = false; load(); }, [topic]);   // eslint-disable-line react-hooks/exhaustive-deps

  // while a run is in flight, poll; when it finishes, do one final refresh so the
  // just-published article (and any run error) appears without a manual reload
  useEffect(() => {
    if (status?.running) {
      wasRunning.current = true;
      const iv = setInterval(load, 20000);
      return () => clearInterval(iv);
    }
    if (wasRunning.current) { wasRunning.current = false; load(); }
  }, [status?.running]);      // eslint-disable-line react-hooks/exhaustive-deps

  const runNow = async () => {
    setMsg("Research agent dispatched — it is searching the live web now. The new briefing lands in this feed in a few minutes.");
    try {
      const r = await api.post("/research/run", { topic });
      if (!r.started) setMsg(r.detail);
      else setTimeout(load, 15000);
    } catch (e) { setMsg(e.message); }
  };

  if (arts === null) return <Loading text="Loading briefings…" />;

  return (
    <>
      <div className="ua-toolbar">
        {user?.is_admin && (
          <button className="btn primary" onClick={runNow} disabled={status?.running}>
            {status?.running ? "⏳ Researching…" : runLabel}
          </button>
        )}
        <span className="spacer" />
        <span className="ua-opt" style={{ fontSize: 12 }}>
          {status?.last_run ? `Last briefing: ${fmtWhen(status.last_run)}` : "No briefings yet"}
          {" · "}{arts.length} in archive · auto-refreshes daily
        </span>
      </div>
      {msg && <div className="login-info" style={{ marginBottom: 12 }}>{msg}</div>}
      {status?.last_error && !status?.running && (
        <div className="login-err" style={{ marginBottom: 12 }}>
          Last research run failed: {status.last_error}
        </div>
      )}

      {arts.length === 0 ? (
        <Hint>
          No briefings yet. The research agent runs automatically every morning (07:00) and its
          articles accumulate here{user?.is_admin ? " — or press the button above to run it now" : ""}.
        </Hint>
      ) : (
        arts.map((a) => (
          <Article key={a.id} a={a} open={openId === a.id}
            onToggle={() => setOpenId(openId === a.id ? null : a.id)} />
        ))
      )}
    </>
  );
}

export function StateIntel() {
  return (
    <>
      <PageHeader title="Mundra vs Major Ports"
        sub="Daily AI research briefing: how Mundra compares with India's major ports — JNPT, Deendayal (Kandla), Chennai, Visakhapatnam and the rest — on traffic, turnaround, tariffs and expansion. Rankings, the good, the bad and the ugly, compiled from public statistics and industry press by the research agent." />
      <IntelFeed topic="ports" runLabel="✦ Research now — Mundra vs major ports" />
    </>
  );
}

export function RivalsIntel() {
  return (
    <>
      <PageHeader title="APSEZ vs Port Operators"
        sub="Daily AI research briefing: APSEZ's market position against Indian and global port operators — JSW Infrastructure, DP World, PSA and peers — concession wins, tenders, expansions and the day's news. Compiled from public sources by the research agent." />
      <IntelFeed topic="rivals" runLabel="✦ Research now — operator watch" />
    </>
  );
}
