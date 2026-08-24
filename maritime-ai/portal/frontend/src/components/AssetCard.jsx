import React, { useState } from "react";
import { useLang } from "../lib/i18n.jsx";

/** Rendered creative (flyer/poster) inside a chat reply: image preview,
 *  download buttons, and a copy-ready caption. */
export default function AssetCard({ asset, compact = false }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  if (!asset) return null;

  const copyCaption = () => {
    navigator.clipboard?.writeText(asset.caption || "").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className={`asset-card ${compact ? "compact" : ""}`}>
      {asset.png_url ? (
        <a href={asset.png_url} target="_blank" rel="noreferrer" title={t("Open full size")}>
          <img className="asset-img" src={asset.png_url} alt={asset.title}
            width={asset.width} height={asset.height} />
        </a>
      ) : (
        <a className="asset-htmlonly" href={asset.html_url} target="_blank" rel="noreferrer">
          {t("Open the flyer (HTML) →")}
        </a>
      )}
      <div className="asset-actions">
        {asset.png_url && (
          <a className="btn" href={asset.png_url} download>{t("⭳ Download image")}</a>
        )}
        <a className="btn" href={asset.html_url} download>{t("⭳ HTML")}</a>
        {asset.caption && (
          <button className="btn" onClick={copyCaption}>
            {copied ? t("Copied ✓") : t("⧉ Copy caption")}
          </button>
        )}
        <span className="asset-meta mono">{asset.width}×{asset.height}px</span>
      </div>
      {asset.caption && !compact && (
        <details className="asset-caption-box">
          <summary>{t("Ready-to-post caption")}</summary>
          <pre className="asset-caption">{asset.caption}</pre>
        </details>
      )}
    </div>
  );
}
