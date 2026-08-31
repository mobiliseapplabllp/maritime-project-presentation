import React, { useEffect, useMemo, useState } from "react";
import { api, getToken } from "../lib/api.js";
import { useApi } from "../lib/useApi.js";
import { PageHeader, Card, Loading, Hint, fmtInt } from "../components/ui.jsx";
import { RecordLink } from "../components/RecordDrawer.jsx";
import { useLang } from "../lib/i18n.jsx";

const GROUP_ICONS = {
  "Operational panels": "▤",
  "AI analysis outputs": "✦",
  "Portal demo records": "⛁",
  "Geography & twin": "⚖",
  "Access & config": "◐",
};

async function downloadCsv(id, q, done) {
  try {
    const res = await fetch(`/api/data/${id}/export${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${id}${q ? "_search" : ""}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  } catch (e) { /* ignore */ }
  done && done();
}

function SourceBlock({ ds }) {
  const { t } = useLang();
  return (
    <div className="ds-source">
      <div className="ds-sec-h">{t("Source")}</div>
      <div className="ds-src-name">{ds.source?.name}</div>
      <div className="ds-src-url mono">{ds.source?.url}</div>
      <div className="ds-src-access">{ds.source?.access}</div>
      <div className="ds-sec-h" style={{ marginTop: 12 }}>{t("How it was obtained")}</div>
      <p>{ds.method}</p>
      <div className="ds-sec-h" style={{ marginTop: 12 }}>{t("Validation")}</div>
      <p>{ds.validation}</p>
      <div className="ds-meta-row">
        {ds.kind === "db"
          ? <span>{t("Storage")}: <b>{ds.storage || "analytics mirror (SQLite)"}</b></span>
          : <span>{t("File")}: <b className="mono">{ds.filename}</b></span>}
        {ds.size_kb != null && <span>{t("{n} KB", { n: fmtInt(ds.size_kb) })}</span>}
        {ds.updated && <span>{t("updated {d}", { d: ds.updated })}</span>}
      </div>
    </div>
  );
}

function DataPreview({ id }) {
  const { t } = useLang();
  const [q, setQ] = useState("");
  const [qLive, setQLive] = useState("");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dl, setDl] = useState(false);
  const limit = 50;

  useEffect(() => {
    let alive = true;
    setBusy(true);
    api.dataPreview(id, { offset, limit, q })
      .then((d) => { if (alive) { setPage(d); setBusy(false); } })
      .catch(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [id, offset, q]);

  const search = (e) => {
    e.preventDefault();
    setOffset(0);
    setQ(qLive.trim());
  };

  if (!page) return <Loading text="Loading data…" />;
  const from = page.total === 0 ? 0 : page.offset + 1;
  const to = Math.min(page.offset + limit, page.total);
  const links = page.links || {};
  const colIdx = {};
  (page.columns || []).forEach((c, i) => { colIdx[c] = i; });
  const cell = (v, j, r) => {
    const display = v == null ? <span className="ds-null">—</span>
      : typeof v === "number"
        ? (Math.abs(v) >= 10000 && Number.isInteger(v) ? Number(v).toLocaleString("en-IN") : String(v))
        : String(v);
    const lk = links[page.columns[j]];
    if (lk && v != null && v !== "") {
      const idVal = lk.id != null ? r[colIdx[lk.id]] : v;
      if (idVal != null && idVal !== "")
        return <RecordLink type={lk.type} id={String(idVal)}>{display}</RecordLink>;
    }
    return display;
  };

  return (
    <div className="ds-preview">
      <div className="ds-preview-bar">
        <form onSubmit={search} className="ds-search">
          <input value={qLive} onChange={(e) => setQLive(e.target.value)}
            placeholder={t("Search rows (e.g. CT3, tanker, 2026-06)…")} />
          <button className="btn" type="submit">{t("Search")}</button>
          {q && <button className="btn" type="button"
            onClick={() => { setQ(""); setQLive(""); setOffset(0); }}>{t("✕ Clear")}</button>}
        </form>
        <div className="ds-pageinfo mono">
          {busy ? t("loading…") : t("rows {from}–{to} of {total}", { from: fmtInt(from), to: fmtInt(to), total: fmtInt(page.total) })}
        </div>
        <div className="ds-pager">
          <button className="btn" disabled={page.offset === 0 || busy}
            onClick={() => setOffset(Math.max(0, offset - limit))}>{t("← Prev")}</button>
          <button className="btn" disabled={to >= page.total || busy}
            onClick={() => setOffset(offset + limit)}>{t("Next →")}</button>
          <button className="btn primary" disabled={dl || page.total === 0}
            title={q ? t("Download the matching rows as CSV") : t("Download the whole dataset as CSV")}
            onClick={() => { setDl(true); downloadCsv(id, q, () => setDl(false)); }}>
            {dl ? t("Preparing…") : (q ? t("⭳ Download CSV (filtered)") : t("⭳ Download CSV"))}
          </button>
        </div>
      </div>
      <div className="tbl-wrap ds-tbl-wrap">
        <table className="tbl ds-tbl">
          <thead>
            <tr>{page.columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {page.rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j} className={typeof v === "number" ? "num" : ""}>{cell(v, j, r)}</td>
                ))}
              </tr>
            ))}
            {page.rows.length === 0 && (
              <tr><td colSpan={page.columns.length} style={{ color: "var(--muted)" }}>
                {t("No rows match “{q}”.", { q })}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DataCatalog() {
  const { t } = useLang();
  const { data, loading, error } = useApi("/data/catalog");
  const [group, setGroup] = useState("All");
  const [openId, setOpenId] = useState(null);

  const view = useMemo(() => {
    if (!data) return [];
    return data.datasets.filter((d) => group === "All" || d.group === group);
  }, [data, group]);

  if (loading) return <Loading text="Loading the data catalogue…" />;
  if (error) return <Hint>{t("Catalogue unavailable: {e}", { e: String(error) })}</Hint>;

  const open = openId && data.datasets.find((d) => d.id === openId);

  if (open) {
    return (
      <div>
        <button className="btn" style={{ marginBottom: 14 }} onClick={() => setOpenId(null)}>
          {t("← Back to catalogue")}
        </button>
        <PageHeader title={open.name} sub={open.desc} />
        <div className="ds-detail-grid">
          <Card title="Provenance" cap="Where this data comes from and why it can be trusted.">
            <SourceBlock ds={open} />
          </Card>
          <Card title="Shape & coverage">
            <div className="ds-shape">
              <div><b>{fmtInt(open.rows)}</b> {t("rows")}</div>
              <div><b>{open.cols}</b> {t("columns")}</div>
              <div className="ds-coverage">{open.coverage}</div>
            </div>
            <div className="ds-sec-h" style={{ marginTop: 10 }}>{t("Columns")}</div>
            <div className="ds-cols">
              {(open.columns || []).map((c) => <span key={c} className="ds-col mono">{c}</span>)}
            </div>
          </Card>
        </div>
        <div style={{ marginTop: 16 }}>
          <Card title="Data" cap="Live rows — searchable, paginated, and downloadable as CSV. Every figure in the portal traces back to tables like this.">
            <DataPreview id={open.id} />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Data Catalogue"
        sub="Every dataset behind Sagar Drishti — what it is, where it was assembled from, how it was validated, and the actual rows. The full evidence base for the port analyses."
      />

      <div className="ds-totals">
        <span><b>{data.totals.datasets}</b> {t("datasets")}</span>
        <span><b>{fmtInt(data.totals.rows)}</b> {t("rows")}</span>
        <span>{t("assembled from the port operations snapshot")}</span>
        <span>{t("searchable · downloadable as CSV")}</span>
      </div>

      <div className="ds-groups">
        <button className={`seg ${group === "All" ? "on" : ""}`} onClick={() => setGroup("All")}>
          {t("All")} ({data.totals.datasets})
        </button>
        {data.groups.map((g) => (
          <button key={g.name} className={`seg ${group === g.name ? "on" : ""}`}
            onClick={() => setGroup(g.name)}>
            {GROUP_ICONS[g.name]} {t(g.name)} ({g.datasets})
          </button>
        ))}
      </div>

      <div className="tbl-wrap" style={{ marginTop: 14 }}>
        <table className="tbl ds-list">
          <thead>
            <tr>
              <th>{t("Dataset")}</th><th>{t("Group")}</th><th className="num">{t("Rows")}</th>
              <th className="num">{t("Cols")}</th><th>{t("Coverage")}</th><th>{t("Source")}</th><th></th>
            </tr>
          </thead>
          <tbody>
            {view.map((d) => (
              <tr key={d.id} className="ds-row" onClick={() => setOpenId(d.id)}>
                <td>
                  <div className="ds-name">{d.name}</div>
                  <div className="ds-desc">{d.desc?.slice(0, 110)}{d.desc?.length > 110 ? "…" : ""}</div>
                </td>
                <td><span className="pill area">{GROUP_ICONS[d.group] || "▤"} {t(d.group.split(" (")[0])}</span></td>
                <td className="num">{fmtInt(d.rows)}</td>
                <td className="num">{d.cols}</td>
                <td className="ds-cov">{d.coverage}</td>
                <td className="ds-cov">{d.source?.name.split(" (")[0]}</td>
                <td className="ds-open">{t("View data →")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Hint>
        {t("Click any dataset to see its full provenance — source, build method, validation notes — and browse the rows. The processed panels and analysis artifacts are retained on disk for full reproducibility.")}
      </Hint>
    </div>
  );
}
