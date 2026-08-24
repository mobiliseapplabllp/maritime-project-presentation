// Voice I/O for Sagar Intelligence — browser-native STT + two TTS engines:
//   1. Sagar Neural (Kokoro sidecar on the server — human-quality en/hi)
//   2. Browser speechSynthesis (fallback, and Gujarati)
import { useRef, useState } from "react";
import { api } from "./api.js";

// ---- Sagar Neural (on-device server TTS) ----
export const NEURAL_NAME = { female: "Sagar Neural (Female)", male: "Sagar Neural (Male)" };
let _neuralOK = false;
export function neuralAvailable() { return _neuralOK; }
export async function refreshNeural() {
  try {
    const s = await api.ttsStatus();
    _neuralOK = !!s.available;
  } catch (e) { _neuralOK = false; }
  return _neuralOK;
}
if (typeof window !== "undefined") setTimeout(() => { refreshNeural(); }, 800);

let _audio = null;          // currently playing neural audio
let _speakToken = 0;        // discards stale in-flight synth requests

function isNeuralName(name) {
  return !!name && name.startsWith("Sagar Neural");
}

async function neuralSpeak(text, baseLang, gender, setSpeaking) {
  const token = ++_speakToken;
  setSpeaking && setSpeaking(true);
  try {
    const blob = await api.ttsBlob(mdToSpeech(text), baseLang, gender);
    if (token !== _speakToken) return;              // superseded/cancelled
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    _audio = a;
    const done = () => {
      URL.revokeObjectURL(url);
      if (_audio === a) _audio = null;
      if (token === _speakToken) setSpeaking && setSpeaking(false);
    };
    a.onended = done;
    a.onerror = done;
    await a.play();
  } catch (e) {
    // neural failed → graceful fallback to the browser engine
    if (token === _speakToken) {
      _browserSpeak(text, baseLang === "hi" ? "hi-IN" : "en-IN", setSpeaking, null);
    }
  }
}

const SR = typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export const sttSupported = !!SR;
export const ttsSupported = typeof window !== "undefined" && "speechSynthesis" in window;

// Languages: English (India), Hindi, Gujarati
export const VOICE_LANGS = [
  { code: "en-IN", label: "EN", name: "English" },
  { code: "hi-IN", label: "हिं", name: "Hindi" },
  { code: "gu-IN", label: "ગુ", name: "Gujarati" },
];

/** Microphone input. onFinal(text) fires once per utterance. */
export function useVoiceInput(onFinal) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef(null);

  const start = (lang = "en-IN") => {
    if (!SR || listening) return;
    const rec = new SR();
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let fin = "", inter = "";
      for (const res of e.results) {
        if (res.isFinal) fin += res[0].transcript;
        else inter += res[0].transcript;
      }
      setInterim(inter);
      if (fin.trim()) { setInterim(""); onFinal(fin.trim()); }
    };
    rec.onend = () => { setListening(false); setInterim(""); };
    rec.onerror = () => { setListening(false); setInterim(""); };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch (e) { setListening(false); }
  };

  const stop = () => { try { recRef.current && recRef.current.stop(); } catch (e) {} };

  return { listening, interim, start, stop };
}

/** Markdown → plain speakable text (drops citations, tables, symbols). */
export function mdToSpeech(md) {
  return String(md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\|[^\n]*\|/g, " ")            // table rows
    .replace(/\[(\d+)\]/g, "")              // [1] citations
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
    .replace(/[#*_>`~•▸→⇩✓☷◈✦]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let _voices = [];
if (ttsSupported) {
  const load = () => { _voices = window.speechSynthesis.getVoices() || []; };
  load();
  window.speechSynthesis.onvoiceschanged = load;
}

// Known Indian/system voices → gender (best-effort; unknown defaults to female,
// which matches most default TTS voices)
const GENDER_HINTS = {
  lekha: "female", swara: "female", kalpana: "female", heera: "female",
  veena: "female", neerja: "female", aditi: "female", raveena: "female",
  samantha: "female", karen: "female", moira: "female", tessa: "female",
  kanya: "female", "google हिन्दी": "female", "google हिंदी": "female",
  rishi: "male", ravi: "male", madhur: "male", hemant: "male", prabhat: "male",
  daniel: "male", aaron: "male", arthur: "male", gordon: "male", alex: "male",
  fred: "male", thomas: "male",
};

export function voiceGender(voice) {
  if (!voice) return "female";
  const n = voice.name.toLowerCase();
  for (const [k, g] of Object.entries(GENDER_HINTS)) {
    if (n.includes(k)) return g;
  }
  if (/female|woman/i.test(voice.name)) return "female";
  if (/\bmale|man\b/i.test(voice.name)) return "male";
  return "female";
}

/** Preference score — most HUMAN-sounding first:
 *  Google network voices (Chrome) and Enhanced/Premium voices beat the robotic
 *  local system voices; Indian voices are preferred among equals. */
function _score(v, lang) {
  const base = lang.split("-")[0];
  const n = v.name.toLowerCase();
  let s = 0;
  if (v.lang === lang) s += 100;                       // e.g. hi-IN
  else if (v.lang && v.lang.startsWith(base)) s += 60;
  // Chrome's Google voices are far more natural than OS-local ones —
  // decisive for English, strong for Hindi (Google हिन्दी is Indian + human)
  if (/google/.test(n)) s += base === "en" ? 200 : 40;
  // user-downloaded high-quality voices (macOS Enhanced/Premium, Windows Natural)
  if (/enhanced|premium|natural|neural/.test(n)) s += 150;
  if (base === "en" && v.lang === "en-IN") s += 40;    // Indian English among equals
  if (/lekha|swara|kalpana|rishi|ravi|heera|veena|neerja|madhur|hemant|aditi|raveena|kanya/.test(n)) s += 25;
  if (v.localService === false) s += 5;
  return s;
}

// macOS "novelty" voices — never offer these for a serious assistant
const NOVELTY = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe|junior|ralph|kathy|fred/i;

/** All plausible voices for a language, best first, with gender labels.
 *  Sagar Neural (server) voices lead for en/hi when the sidecar is up;
 *  Gujarati always uses the best browser voice. */
export function listVoicesFor(lang) {
  const base = lang.split("-")[0];
  let out = _voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(base));
  if (base === "en") {
    // keep it sane: en-IN + a few majors
    out = _voices.filter((v) => /^en/i.test(v.lang || ""));
  }
  out = out.filter((v) => !NOVELTY.test(v.name));
  if (!out.length) out = _voices.filter((v) => !NOVELTY.test(v.name));
  // When Sagar Neural is up (en/hi) it is the ONLY offering — the browser
  // voices return solely as an emergency fallback if the engine is down.
  if (_neuralOK && (base === "en" || base === "hi")) {
    return [
      { voice: null, name: NEURAL_NAME.female, lang: `${base}-IN`, gender: "female", score: 999, neural: true },
      { voice: null, name: NEURAL_NAME.male, lang: `${base}-IN`, gender: "male", score: 998, neural: true },
    ];
  }
  return out
    .map((v) => ({ voice: v, name: v.name, lang: v.lang,
                   gender: voiceGender(v), score: _score(v, lang) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
}

const PREF_KEY = (lang) => `sagar_voice_${lang.split("-")[0]}`;

export function setPreferredVoice(lang, name) {
  localStorage.setItem(PREF_KEY(lang), name || "");
}

export function getPreferredVoice(lang) {
  const name = localStorage.getItem(PREF_KEY(lang));
  if (name) {
    const v = _voices.find((x) => x.name === name);
    if (v) return v;
  }
  return null;
}

function pickVoice(lang) {
  const pref = getPreferredVoice(lang);
  if (pref) return pref;
  const ranked = listVoicesFor(lang);
  return ranked.length ? ranked[0].voice : null;
}

// Chrome desktop pauses/stalls long speech and silently drops speak() calls
// that race a cancel(). Keep-alive + delayed start + watchdog work around it.
let _kaTimer = null;
function _keepAlive(synth) {
  clearInterval(_kaTimer);
  _kaTimer = setInterval(() => {
    if (!synth.speaking) { clearInterval(_kaTimer); _kaTimer = null; return; }
    try { synth.resume(); } catch (e) {}
  }, 8000);
}

/** Speak text aloud. Cancels anything already speaking.
 *  setSpeaking (optional) receives true on start / false when done.
 *  voiceName (optional) forces a specific voice — browser or Sagar Neural.
 *  Routing: explicit choice wins; otherwise the stored preference; otherwise
 *  Sagar Neural when the sidecar is up (en/hi); otherwise best browser voice
 *  (Gujarati always goes through the browser engine). */
export function speak(text, lang = "en-IN", setSpeaking, voiceName = null) {
  const base = lang.split("-")[0];
  const stored = typeof localStorage !== "undefined"
    ? localStorage.getItem(PREF_KEY(lang)) : "";
  const effective = voiceName || stored || "";

  // Sagar Neural is the ONLY voice for en/hi when the engine is up —
  // any old browser-voice preference is overridden (gender is honoured)
  if (_neuralOK && (base === "en" || base === "hi")) {
    if (ttsSupported) window.speechSynthesis.cancel();
    const gender = effective === NEURAL_NAME.male ? "male" : "female";
    neuralSpeak(text, base, gender, setSpeaking);
    return;
  }
  _browserSpeak(text, lang, setSpeaking,
    isNeuralName(effective) ? null : (effective || null));
}

function _browserSpeak(text, lang = "en-IN", setSpeaking, voiceName = null) {
  if (!ttsSupported) { setSpeaking && setSpeaking(false); return; }
  const synth = window.speechSynthesis;
  synth.cancel();
  const clean = mdToSpeech(text);
  if (!clean) { setSpeaking && setSpeaking(false); return; }
  // chunk on sentence boundaries — long single utterances stall some engines
  const parts = clean.match(/[^.!?।]+[.!?।]?/g) || [clean];
  const chunks = [];
  let buf = "";
  for (const p of parts) {
    if ((buf + p).length > 220) { if (buf) chunks.push(buf); buf = p; }
    else buf += p;
  }
  if (buf) chunks.push(buf);
  const voice = (voiceName && _voices.find((v) => v.name === voiceName)) || pickVoice(lang);

  setSpeaking && setSpeaking(true);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(_kaTimer); _kaTimer = null;
    setSpeaking && setSpeaking(false);
  };

  // let the cancel() settle before queueing — Chrome ignores speak() otherwise
  setTimeout(() => {
    try { synth.resume(); } catch (e) {}
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c);
      u.lang = lang;
      if (voice) u.voice = voice;
      // Google network voices sound best at natural rate; local voices a touch slower
      u.rate = voice && /google/i.test(voice.name) ? 1.0 : 0.98;
      u.volume = 1;
      u.onerror = finish;                       // blocked/cancelled → move on
      if (i === chunks.length - 1) u.onend = finish;
      synth.speak(u);
    });
    _keepAlive(synth);
    // watchdog: if audio never actually starts (autoplay-blocked), don't hang
    setTimeout(() => { if (!synth.speaking && !finished) finish(); }, 3000);
  }, 90);
}

export function stopSpeaking(setSpeaking) {
  clearInterval(_kaTimer); _kaTimer = null;
  _speakToken++;                                 // invalidate in-flight neural fetches
  if (_audio) { try { _audio.pause(); } catch (e) {} _audio = null; }
  if (ttsSupported) window.speechSynthesis.cancel();
  setSpeaking && setSpeaking(false);
}
