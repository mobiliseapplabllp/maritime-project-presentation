import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import Markdown from "./Markdown.jsx";
import { useLang } from "../lib/i18n.jsx";

/** "✨ AI explain" modal — Sagar Intelligence explains a chart/table/trend in plain
 *  language, grounded in the live data. Explanations are cached server-side.
 *  `preview` (optional JSX) re-renders the element being explained inside the
 *  modal, so the reader sees the chart and its explanation side by side. */
export default function ExplainModal({ title, caption, data, preview, page = null, onClose }) {
  const { t } = useLang();
  const [text, setText] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    api.explain({ title, caption, page: page || window.location.pathname, data: data ?? null })
      .then((d) => alive && setText(d.explanation))
      .catch((e) => alive && setError(String(e.message || e)));
    return () => { alive = false; };
  }, [title, caption]);         // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fd-overlay" onClick={onClose}>
      <div className="fd-modal explain-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="fd-head explain">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="explain-badge">✨ {t("Sagar Intelligence explains")}</span>
            <button className="fd-x" onClick={onClose}>×</button>
          </div>
          <div className="fd-title">{t(title)}</div>
          {caption && <div className="explain-sub">{t(caption)}</div>}
        </div>
        <div className="fd-body">
          {preview && (
            <div className="explain-preview">
              <div className="explain-preview-label">{t("What you're looking at")}</div>
              <div className="explain-preview-inner">{preview}</div>
            </div>
          )}
          {!text && !error && (
            <div className="explain-loading">
              <span className="typing"><i /><i /><i /></span>
              <span>{t("Sagar Intelligence is reading this chart and writing a plain-language explanation…")}</span>
            </div>
          )}
          {error && <div className="hint">Explanation unavailable right now: {error}</div>}
          {text && <Markdown>{text}</Markdown>}
        </div>
        <div className="explain-foot mono">
          {t("Plain-language explanation · grounded in the live portal data · for orientation, not a substitute for the underlying tables")}
        </div>
      </div>
    </div>
  );
}
