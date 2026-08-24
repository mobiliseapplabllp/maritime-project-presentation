// Lightweight trilingual i18n — English (source), Hindi, Gujarati.
// gettext-style: the English string IS the key; anything untranslated falls
// back to English, so a missing entry can never break a page.
import React, { createContext, useContext, useEffect, useState } from "react";
import { TRANSLATIONS } from "./translations.js";
import { TRANSLATIONS2 } from "./translations2.js";

// merged dictionary — the supplementary extension (translations2) wins on collisions
const DICT = {
  hi: { ...(TRANSLATIONS.hi || {}), ...(TRANSLATIONS2.hi || {}) },
  gu: { ...(TRANSLATIONS.gu || {}), ...(TRANSLATIONS2.gu || {}) },
};

const LangCtx = createContext({ lang: "en", setLang: () => {}, t: (s) => s });

export const LANGS = [
  { code: "en", label: "EN", name: "English" },
  { code: "hi", label: "हिं", name: "हिन्दी" },
  { code: "gu", label: "ગુ", name: "ગુજરાતી" },
];

const ALLOWED = LANGS.map((l) => l.code);

export function getLang() {
  const v = localStorage.getItem("sagar_lang") || "en";
  return ALLOWED.includes(v) ? v : "en";   // ignore any stale / removed language (e.g. old "bn")
}

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(getLang());
  const setLang = (code) => {
    localStorage.setItem("sagar_lang", code);
    setLangState(code);
  };
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const t = (s, vars) => {
    if (s == null) return s;
    let out = lang === "en" ? s : (DICT[lang] && DICT[lang][s]) || s;
    if (vars) Object.entries(vars).forEach(([k, v]) => { out = out.split(`{${k}}`).join(v); });
    return out;
  };
  return <LangCtx.Provider value={{ lang, setLang, t }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return useContext(LangCtx);
}

/** Compact EN | हिं | ગુ switcher for the topbar / login. */
export function LangSwitcher({ compact = false }) {
  const { lang, setLang } = useLang();
  return (
    <span className={`lang-switch ${compact ? "compact" : ""}`}>
      {LANGS.map((l) => (
        <button key={l.code} className={lang === l.code ? "on" : ""}
          title={l.name} onClick={() => setLang(l.code)}>{l.label}</button>
      ))}
    </span>
  );
}
