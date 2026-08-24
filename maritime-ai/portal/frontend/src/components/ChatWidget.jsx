import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { MiniBars, TrendLine } from "./charts.jsx";
import Markdown from "./Markdown.jsx";
import AssetCard from "./AssetCard.jsx";
import { sttSupported, ttsSupported, VOICE_LANGS, useVoiceInput, speak, stopSpeaking } from "../lib/voice.js";
import { useLang } from "../lib/i18n.jsx";

const SUGGESTIONS = [
  "Longest waiting terminals",
  "Outstanding receivables",
  "Vessel watchlist",
  "What are the findings?",
];

const SUGGESTIONS_DOCS = [
  "Monsoon UKC restrictions",
  "PSC detention grounds",
  "Berthing priority rules",
  "Certificate renewal windows",
];

function renderBold(text) {
  // convert **x** to <b>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**")
      ? <b key={i}>{p.slice(2, -2)}</b>
      : <span key={i}>{p}</span>
  );
}

function ChartBlock({ chart }) {
  const { t } = useLang();
  if (!chart) return null;
  if (chart.type === "bars") {
    return (
      <div className="msg-chart">
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{chart.title}</div>
        <MiniBars items={chart.items.map((i) => ({ name: i.name, v: i.v }))}
          suffix={chart.suffix ?? ""} />
      </div>
    );
  }
  if (chart.type === "line") {
    return (
      <div className="msg-chart">
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{chart.title}</div>
        <TrendLine data={chart.series} xKey="ym" height={180}
          lines={[{ key: "v", name: t("Value"), color: "var(--accent)" }]} />
      </div>
    );
  }
  return null;
}

export default function ChatWidget() {
  const { t } = useLang();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([
    { role: "bot", text: t("Hi — I'm **Sagar Intelligence**. Ask me about vessel traffic, a berth or terminal, the waiting queues, incidents, receivables, or the findings. I answer from the live data, scoped to your access. For a full formatted report, open Full screen.") },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [docsMode, setDocsMode] = useState(false);
  const [voiceLang, setVoiceLang] = useState(0);
  const [autoRead, setAutoRead] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const bodyRef = useRef(null);
  const mic = useVoiceInput((text) => send(text));

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [msgs, busy, open]);

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || busy) return;
    setInput("");
    const history = msgs.filter((m) => m.text).map((m) => ({
      role: m.role === "bot" ? "assistant" : "user", content: m.text,
    }));
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await api.chat(q, history, docsMode ? "docs" : "concise");
      setMsgs((m) => [...m, { role: "bot", text: res.reply, chart: res.chart,
        table: res.table, ragSources: res.rag_sources, asset: res.asset }]);
      if (autoRead) speak(res.reply, VOICE_LANGS[voiceLang].code, setSpeaking);
    } catch (e) {
      setMsgs((m) => [...m, { role: "bot", text: t("Sorry — {msg}", { msg: e.message }) }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => stopSpeaking(), []);

  return (
    <>
      <button className="chat-fab" onClick={() => setOpen((o) => !o)} title={t("Ask the analyst assistant")}>
        {open ? "×" : "💬"}
      </button>
      {open && (
        <div className="chat-panel">
          <div className="chat-head">
            <span className="dot" />
            <div>
              <div className="t">{t("Sagar Intelligence")}</div>
              <div className="s">{docsMode ? t("documents · RAG") : t("analyst · live data")}</div>
            </div>
            <button className={`fs-link ${docsMode ? "on" : ""}`} title={t("Toggle document (RAG) mode")}
              onClick={() => setDocsMode((d) => !d)}>{docsMode ? `📚 ${t("Docs")} ✓` : `📚 ${t("Docs")}`}</button>
            <button className="fs-link" title={t("Voice conversation")}
              onClick={() => { setOpen(false); navigate("/voice"); }}>🎙</button>
            <button className="fs-link" title={t("Open full-screen analyst")}
              onClick={() => { setOpen(false); navigate("/assistant"); }}>⤢ {t("Full screen")}</button>
            <button className="x" onClick={() => setOpen(false)}>×</button>
          </div>
          <div className="chat-body" ref={bodyRef}>
            {msgs.map((m, i) => (
              <React.Fragment key={i}>
                <div className={`msg ${m.role}`}>
                  {m.role === "bot" ? <Markdown>{m.text}</Markdown> : m.text}
                </div>
                {m.chart && <ChartBlock chart={m.chart} />}
                {m.asset && <div style={{ margin: "6px 10px" }}><AssetCard asset={m.asset} compact /></div>}
                {m.ragSources && m.ragSources.length > 0 && (
                  <div className="rag-sources" style={{ margin: "6px 10px" }}>
                    {m.ragSources.slice(0, 4).map((s) => (
                      <a key={s.n} className="rag-chip" href={s.url} target="_blank" rel="noreferrer">
                        <b>[{s.n}]</b> {s.title.slice(0, 38)}… {t("p.")}{s.page}
                      </a>
                    ))}
                  </div>
                )}
                {m.table && (
                  <div className="msg-chart">
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{m.table.title}</div>
                    <div className="tbl-wrap">
                      <table className="tbl">
                        <thead><tr>{m.table.columns.map((c, j) => <th key={j}>{c}</th>)}</tr></thead>
                        <tbody>
                          {m.table.rows.map((r, j) => (
                            <tr key={j}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </React.Fragment>
            ))}
            {busy && (
              <div className="msg bot"><span className="typing"><i /><i /><i /></span></div>
            )}
          </div>
          <div className="chat-suggest">
            {(docsMode ? SUGGESTIONS_DOCS : SUGGESTIONS).map((s) => (
              <button key={s} onClick={() => send(t(s))} disabled={busy}>{t(s)}</button>
            ))}
          </div>
          {(mic.listening || mic.interim) && (
            <div className="voice-live sm">
              <span className="mic-pulse" /> {t("Listening")} ({VOICE_LANGS[voiceLang].name})…
              {mic.interim && <em>&nbsp;“{mic.interim}”</em>}
            </div>
          )}
          <div className="chat-input">
            <input value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={docsMode ? t("Ask the port documents…") : t("Ask about the data…")} disabled={busy} />
            {sttSupported && (
              <>
                <button className="voice-lang sm" title={t("Voice language")}
                  onClick={() => setVoiceLang((voiceLang + 1) % VOICE_LANGS.length)}>
                  {VOICE_LANGS[voiceLang].label}
                </button>
                <button className={`mic-btn sm ${mic.listening ? "rec" : ""}`}
                  title={mic.listening ? t("Stop") : t("Speak ({lang})", { lang: VOICE_LANGS[voiceLang].name })}
                  onClick={() => mic.listening ? mic.stop() : mic.start(VOICE_LANGS[voiceLang].code)}
                  disabled={busy}>
                  {mic.listening ? "◼" : "🎤"}
                </button>
              </>
            )}
            {ttsSupported && (
              <button className={`voice-out sm ${autoRead ? "on" : ""}`}
                title={speaking ? t("Stop reading") : autoRead ? t("Voice replies ON") : t("Voice replies OFF")}
                onClick={() => { if (speaking) stopSpeaking(setSpeaking); else setAutoRead((v) => !v); }}>
                🔊
              </button>
            )}
            <button onClick={() => send()} disabled={busy}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}
