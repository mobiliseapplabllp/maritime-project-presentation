import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import { useLang } from "../lib/i18n.jsx";
import { sttSupported, ttsSupported, speak, stopSpeaking, listVoicesFor, setPreferredVoice, refreshNeural } from "../lib/voice.js";

const STT_LANG = { en: "en-IN", hi: "hi-IN", gu: "gu-IN" };
const SR = typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

function getLangSafe() {
  try { const v = localStorage.getItem("sagar_lang") || "en"; return ["en", "hi", "gu"].includes(v) ? v : "en"; } catch (e) { return "en"; }
}

/**
 * Full-screen hands-free voice conversation with Sagar Intelligence — like talking
 * to Claude: listen → think → speak the crux aloud → listen again.
 * Tap the orb to interrupt or pause. Esc / ✕ exits.
 */
export default function VoiceMode() {
  const navigate = useNavigate();
  const { t, lang } = useLang();
  const [phase, setPhase] = useState("idle");   // idle|listening|thinking|speaking|paused
  const [caption, setCaption] = useState("");
  const [turns, setTurns] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [voiceName, setVoiceName] = useState(() => {
    try { return localStorage.getItem("sagar_voice_" + (STT_LANG[getLangSafe()] || "en-IN").split("-")[0]) || ""; } catch (e) { return ""; }
  });
  const phaseRef = useRef("idle");
  const aliveRef = useRef(true);
  const recRef = useRef(null);
  const failsRef = useRef(0);
  const turnsRef = useRef([]);

  const setPh = (p) => { phaseRef.current = p; setPhase(p); };

  const voices = ttsSupported ? listVoicesFor(STT_LANG[lang] || "en-IN") : [];
  const activeVoice = voices.find((v) => v.name === voiceName) || voices[0] || null;
  const gender = activeVoice ? activeVoice.gender : "female";
  const genderRef = useRef(gender);
  genderRef.current = gender;

  // first-person status lines must match the speaker's gender in hi/gu
  const gendered = (key) => {
    const G = {
      hi: {
        female: { listening: "सुन रही हूँ — बोलिए", thinking: "सोच रही हूँ…", speaking: "बोल रही हूँ…" },
        male: { listening: "सुन रहा हूँ — बोलिए", thinking: "सोच रहा हूँ…", speaking: "बोल रहा हूँ…" },
      },
      gu: {
        female: { listening: "સાંભળી રહી છું — બોલો", thinking: "વિચારી રહી છું…", speaking: "બોલી રહી છું…" },
        male: { listening: "સાંભળી રહ્યો છું — બોલો", thinking: "વિચારી રહ્યો છું…", speaking: "બોલી રહ્યો છું…" },
      },
    };
    return G[lang]?.[gender]?.[key] || null;
  };

  const say = (text, onDone) => {
    if (!aliveRef.current) return;
    if (mutedRef.current) return;   // muted: stay silent, stay muted
    setPh("speaking");
    setCaption(text);
    if (!ttsSupported) { onDone && onDone(); return; }
    speak(text, STT_LANG[lang] || "en-IN", (speaking) => {
      if (!speaking && aliveRef.current && phaseRef.current === "speaking") {
        onDone && onDone();
      }
    }, voiceName || (activeVoice && activeVoice.name) || null);
  };

  const listen = () => {
    if (!aliveRef.current || !SR || mutedRef.current) return;
    setPh("listening");
    setCaption("");
    const rec = new SR();
    rec.lang = STT_LANG[lang] || "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let gotFinal = false;
    rec.onresult = (e) => {
      let fin = "", inter = "";
      for (const r of e.results) (r.isFinal ? (fin += r[0].transcript) : (inter += r[0].transcript));
      if (inter) setCaption(inter);
      if (fin.trim()) { gotFinal = true; handleUtterance(fin.trim()); }
    };
    rec.onerror = (e) => {
      if (!aliveRef.current || phaseRef.current !== "listening") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setPh("paused");
        setCaption(t("Microphone unavailable — allow mic access and tap the orb."));
      }
    };
    rec.onend = () => {
      if (!aliveRef.current || gotFinal || mutedRef.current || phaseRef.current !== "listening") return;
      failsRef.current += 1;
      if (failsRef.current >= 3) {           // silence x3 → pause politely
        setPh("paused");
        setCaption(t("Paused — tap the orb to talk"));
        failsRef.current = 0;
      } else {
        try { listen(); } catch (err) { setPh("paused"); }
      }
    };
    recRef.current = rec;
    try { rec.start(); } catch (e) { setPh("paused"); }
  };

  const stopListening = () => { try { recRef.current && recRef.current.stop(); } catch (e) {} };

  const handleUtterance = async (q) => {
    failsRef.current = 0;
    stopListening();
    turnsRef.current = [...turnsRef.current, { role: "user", text: q }].slice(-8);
    setTurns(turnsRef.current);
    setPh("thinking");
    setCaption(q);
    try {
      const history = turnsRef.current.slice(0, -1).map((m) => ({
        role: m.role === "bot" ? "assistant" : "user", content: m.text }));
      const res = await api.chat(q, history, "voice", { voice_gender: genderRef.current });
      if (!aliveRef.current) return;
      const reply = (res.reply || "").trim();
      turnsRef.current = [...turnsRef.current, { role: "bot", text: reply }].slice(-8);
      setTurns(turnsRef.current);
      say(reply, () => listen());              // hands-free: speak, then listen again
    } catch (e) {
      if (!aliveRef.current) return;
      say(t("Sorry, I couldn't answer that just now. Please ask again."), () => listen());
    }
  };

  const greetedRef = useRef(false);

  const toggleMute = () => {
    if (!mutedRef.current) {
      mutedRef.current = true;
      setMuted(true);
      stopSpeaking();
      stopListening();
      setPh("muted");
      setCaption(t("Muted — I am not listening. Tap Unmute when you're ready."));
    } else {
      mutedRef.current = false;
      setMuted(false);
      if (greetedRef.current) { listen(); }
      else { setPh("paused"); setCaption(t("Tap the orb to start the conversation.")); }
    }
  };

  const orbTap = () => {
    if (mutedRef.current) {
      setCaption(t("Muted — I am not listening. Tap Unmute when you're ready."));
      return;
    }
    const p = phaseRef.current;
    // first tap = the user gesture Chrome needs before it allows audio:
    // speak the greeting now, then start listening
    if (!greetedRef.current) {
      greetedRef.current = true;
      say(t("Hello! I'm Sagar Intelligence. Ask me about vessel traffic, waiting and turnaround, incidents, receivables, or any vessel and berth across Port Authority."),
        () => listen());
      return;
    }
    if (p === "speaking") { stopSpeaking(); listen(); }        // interrupt
    else if (p === "listening") { stopListening(); setPh("paused"); setCaption(t("Paused — tap the orb to talk")); }
    else if (p === "paused" || p === "idle") { listen(); }
    // thinking: ignore taps
  };

  const exit = () => {
    aliveRef.current = false;
    stopSpeaking();
    stopListening();
    navigate("/assistant");
  };

  const [, forceRender] = useState(0);
  useEffect(() => { refreshNeural().then(() => forceRender((x) => x + 1)); }, []);

  useEffect(() => {
    aliveRef.current = true;
    const onKey = (e) => e.key === "Escape" && exit();
    window.addEventListener("keydown", onKey);
    // Chrome only allows audio after a user gesture — wait for the first tap
    if (sttSupported) {
      setPh("paused");
      setCaption(t("Tap the orb to start the conversation."));
    } else {
      setPh("paused");
      setCaption(t("Voice input is not supported in this browser."));
    }
    return () => {
      aliveRef.current = false;
      window.removeEventListener("keydown", onKey);
      stopSpeaking();
      stopListening();
    };
  }, []);                                     // eslint-disable-line react-hooks/exhaustive-deps

  const statusLine = {
    idle: t("Starting…"),
    listening: gendered("listening") || t("Listening — go ahead, speak"),
    thinking: gendered("thinking") || t("Thinking…"),
    speaking: gendered("speaking") || t("Speaking…"),
    paused: t("Paused — tap the orb to talk"),
    muted: t("Muted"),
  }[phase];

  return (
    <div className="voice-stage" role="dialog" aria-label={t("Voice conversation")}>
      <button className="voice-exit" onClick={exit}>✕ {t("Exit")}</button>
      <button className={`voice-mute ${muted ? "on" : ""}`} onClick={toggleMute}>
        {muted ? `🎙 ${t("Unmute")}` : `🔇 ${t("Mute")}`}
      </button>
      <div className="voice-lang-badge mono">{(STT_LANG[lang] || "en-IN").split("-")[0].toUpperCase()}</div>

      <div className={`voice-orb ${phase}`} onClick={orbTap} role="button"
        aria-label={statusLine} tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && orbTap()}>
        <div className="voice-orb-core" />
        <div className="voice-orb-ring r1" />
        <div className="voice-orb-ring r2" />
      </div>

      <div className="voice-status">{statusLine}</div>
      <div className={`voice-caption ${phase}`}>{caption}</div>

      <div className="voice-log">
        {turns.slice(-4).map((m, i) => (
          <div key={i} className={`voice-turn ${m.role}`}>
            <span>{m.role === "user" ? "🎙" : "✦"}</span> {m.text.length > 110 ? m.text.slice(0, 110) + "…" : m.text}
          </div>
        ))}
      </div>

      <button className="voice-picker-btn" onClick={() => setPickerOpen((o) => !o)}>
        🗣 {activeVoice ? activeVoice.name : t("Choose voice")}
        <span className="voice-gender-tag">{gender === "female" ? t("Female") : t("Male")}</span>
      </button>

      {pickerOpen && (
        <div className="voice-picker" onClick={(e) => e.stopPropagation()}>
          <div className="voice-picker-h">{t("Choose voice")}</div>
          {voices.length === 0 && <div className="voice-picker-empty">{t("No voices available for this language.")}</div>}
          {voices.map((v) => (
            <button key={v.name}
              className={`voice-opt ${v.name === (activeVoice && activeVoice.name) ? "on" : ""}`}
              onClick={() => {
                setVoiceName(v.name);
                setPreferredVoice(STT_LANG[lang] || "en-IN", v.name);
                stopSpeaking();
                const sample = lang === "hi"
                  ? (v.gender === "female" ? "नमस्ते, मैं आपकी सहायक हूँ। मैं आपको जहाज़ों, बर्थ और बंदरगाह की जानकारी दे सकती हूँ।"
                                            : "नमस्ते, मैं आपका सहायक हूँ। मैं आपको जहाज़ों, बर्थ और बंदरगाह की जानकारी दे सकता हूँ।")
                  : lang === "gu"
                  ? (v.gender === "female" ? "નમસ્તે, હું તમારી સહાયક છું. હું તમને જહાજો, બર્થ અને બંદરની માહિતી આપી શકું છું."
                                            : "નમસ્તે, હું તમારો સહાયક છું. હું તમને જહાજો, બર્થ અને બંદરની માહિતી આપી શકું છું.")
                  : "Hello, I am your assistant. I can tell you about vessel traffic, berth performance and receivables.";
                speak(sample, STT_LANG[lang] || "en-IN", null, v.name);
              }}>
              <span className="voice-opt-g">{v.gender === "female" ? "♀" : "♂"}</span>
              <span className="voice-opt-n">{v.name}</span>
              <span className="voice-opt-l mono">{v.lang}</span>
            </button>
          ))}
          <div className="voice-picker-note">{t("Tap a voice to hear a sample. The assistant's grammar follows the voice.")}<br />
            {t("Tip: voices named 'Google' sound the most natural (Chrome).")}</div>
        </div>
      )}

      <div className="voice-foot mono">Sagar Intelligence · Sagar Drishti · {t("tap the orb to interrupt or pause")}</div>
    </div>
  );
}
