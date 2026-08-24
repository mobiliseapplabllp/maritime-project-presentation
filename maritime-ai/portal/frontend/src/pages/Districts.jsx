import React, { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { useApi } from "../lib/useApi.js";
import { Card, PageHeader, Loading, StatTile, DataTable, Hint, fmtInt } from "../components/ui.jsx";
import { MiniBars } from "../components/charts.jsx";
import Markdown from "../components/Markdown.jsx";
import { RecordLink } from "../components/RecordDrawer.jsx";
import { useLang } from "../lib/i18n.jsx";
import MundraTwin from "../components/MundraTwin.jsx";

const cr = (v) => (v == null ? "—" : "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " Cr");
const pct = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);
const hrs = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}h`);
const OCC_LBL = { a_lt10: "<10% (idle)", b_10_25: "10–25%", c_25_40: "25–40%", d_40_70: "40–70% (healthy)", e_gt70: ">70% (congested)" };

function AIBrief() {
  const { lang, t } = useLang();
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { const r = await api.get("/records/facilities/analysis"); setReport(r.report); }
    catch (e) { setReport(`_${e.message}_`); }
    setBusy(false);
  };
  // re-generate an already-shown brief in the newly selected language
  useEffect(() => { if (report) run(); }, [lang]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ margin: "16px 0" }}>
      {!report && <button className="btn primary" disabled={busy} onClick={run}>{busy ? t("Analysing the berth estate…") : t("✦ AI berth-estate analysis")}</button>}
      {report && <Card title="AI berth-estate analysis" cap="Portfolio brief across all 24 berths, scoped to your role."><Markdown>{report}</Markdown></Card>}
    </div>
  );
}

// Port Benchmark — port total, the three zones, and the all-terminal league
function RegionTab() {
  const { t } = useLang();
  const { data } = useApi("/region");
  const { data: dist } = useApi("/records/districts");
  if (!data || !dist) return <Loading />;
  const zrow = (u, i) => (
    <tr key={i}>
      <td>{u.unit_name}</td>
      <td className="num">{fmtInt(u.vessel_calls)}</td>
      <td className="num">{fmtInt(u.cargo_mt)}</td>
      <td className="num">{fmtInt(u.teu)}</td>
      <td className="num">{hrs(u.avg_turnaround_hr)}</td>
      <td className="num">{hrs(u.avg_waiting_hr)}</td>
      <td className="num">{fmtInt(u.incidents_total)}</td>
      <td className="num">{cr(u.outstanding_cr)}</td>
    </tr>
  );
  const s = dist.summary || {};
  return (
    <>
      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <StatTile label="Terminals" value={fmtInt(s.terminals)} note={t("{f} berths · {a} calls in 12m", { f: fmtInt(s.berths), a: fmtInt(s.calls_12m) })} />
        <StatTile label="Avg terminal waiting" value={hrs(s.avg_waiting_hr)} note={t("vs the 5h pre-berthing target")} tone={s.avg_waiting_hr > 5 ? "warn" : "good"} />
        <StatTile label="Incident concentration" value={s.top3_incident_share_pct != null ? s.top3_incident_share_pct + "%" : "—"} note={t("sits in just the top 3 terminals")} tone="crit" />
      </div>
      <Card title="Port & zones — traffic and performance" cap="Mundra Port as a whole, then its three operating zones, latest month.">
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>{t("Unit")}</th><th>{t("Calls")}</th><th>{t("Cargo MT")}</th><th>{t("TEU")}</th><th>{t("Turnaround")}</th><th>{t("Waiting")}</th><th>{t("Incidents")}</th><th>{t("Outstanding")}</th></tr></thead>
          <tbody>
            {(data.port || []).map(zrow)}
            {(data.zones || []).map(zrow)}
          </tbody></table></div>
      </Card>
      <Card title="Terminal league — click a terminal for its full AI analysis"
        cap="All terminals benchmarked head-to-head (highest composite risk first). Every terminal name opens its dedicated intelligence portal with a data-grounded AI brief.">
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>{t("Terminal")}</th><th>{t("Zone")}</th><th>{t("Berths")}</th><th>{t("Calls 12m")}</th><th>{t("Cargo MT")}</th><th>{t("Waiting")}</th><th>{t("Occupancy")}</th><th>{t("Incidents")}</th><th>{t("Detentions")}</th><th>{t("Outstanding")}</th><th>{t("Risk")}</th></tr></thead>
          <tbody>{(dist.terminals || []).map((r) => (
            <tr key={r.terminal}>
              <td><RecordLink type="district" id={r.terminal}>{r.name}</RecordLink></td>
              <td>{r.zone}</td>
              <td className="num">{fmtInt(r.berths)}</td>
              <td className="num">{fmtInt(r.calls_12m)}</td>
              <td className="num">{fmtInt(r.cargo_12m_mt)}</td>
              <td className="num" style={{ color: r.avg_waiting_hr > 18 ? "var(--crit)" : undefined }}>{hrs(r.avg_waiting_hr)}</td>
              <td className="num">{pct(r.occupancy_pct)}</td>
              <td className="num">{fmtInt(r.incidents_12m)}</td>
              <td className="num">{fmtInt(r.detentions)}</td>
              <td className="num">{r.outstanding_cr ? cr(r.outstanding_cr) : "—"}</td>
              <td className="num" style={{ color: r.risk_score >= 60 ? "var(--crit)" : undefined }}>{r.risk_score}</td>
            </tr>))}
          </tbody></table></div>
      </Card>
    </>
  );
}

// Terminal Twin — the 3D port model, shown as a Port Explorer tab
function TwinTab() {
  const { t: tr } = useLang();
  return (
    <>
      <div className="ds-sec-h" style={{ margin: "4px 0 12px" }}>
        {tr("Every terminal raised and coloured by the selected lens — rotate, zoom, and click a terminal to fly in. Heights and colours come from the live port panels and the AI terminal-risk engine.")}
      </div>
      <MundraTwin />
    </>
  );
}

function FacilitiesTab() {
  const { t: tr } = useLang();
  const [sum, setSum] = useState(null);
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [qLive, setQLive] = useState("");
  const [sort, setSort] = useState("wait");
  const [btype, setBtype] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => { api.get("/records/facilities/summary").then(setSum).catch(() => {}); }, []);
  useEffect(() => { const tm = setTimeout(() => { setQ(qLive); setPage(1); }, 350); return () => clearTimeout(tm); }, [qLive]);
  useEffect(() => {
    const ps = new URLSearchParams({ q, sort, page: String(page), ...(btype ? { btype } : {}) });
    api.get(`/records/facilities?${ps}`).then(setList).catch(() => {});
  }, [q, sort, btype, page]);

  if (!sum) return <Loading text="Loading the berth estate…" />;
  const t = sum.totals;
  const pages = list ? Math.max(1, Math.ceil(list.total / list.page_size)) : 1;

  return (
    <>
      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <StatTile label="Berths" value={fmtInt(t.berths)} note={tr("{n} operational", { n: fmtInt(t.operational) })} />
        <StatTile label="Calls (12m)" value={fmtInt(t.calls_12m)} note={tr("{n} MT cargo handled", { n: fmtInt(t.cargo_12m_mt) })} tone="accent" />
        <StatTile label="Estate avg waiting" value={hrs(t.avg_waiting_hr)} note={tr("vs the 5h pre-berthing target")} tone={t.avg_waiting_hr > 5 ? "warn" : "good"} />
        <StatTile label="Incidents (12m)" value={fmtInt(t.incidents_12m)} note={tr("top 5 berths = {p} of them", { p: pct(sum.concentration?.top5_incident_share_pct) })} tone="crit" />
        <StatTile label="Incident concentration" value={pct(sum.concentration?.top10_incident_share_pct)} note={tr("sits in just 10 berths")} tone="crit" />
      </div>

      <AIBrief />

      <div className="grid two">
        <Card title="Occupancy distribution across berths" cap="How many berths fall in each occupancy band. Below 40% is idle capacity; above 70% builds queues.">
          <MiniBars items={(sum.occupancy_distribution || []).map((b) => ({ name: tr(OCC_LBL[b.band] || b.band), v: b.n }))} suffix="" />
        </Card>
        <Card title="Zones — traffic & waiting" cap="The three operating zones benchmarked head-to-head.">
          <DataTable columns={["Zone", "Berths", "Calls", "Incidents", "Avg wait"]} numeric={[1, 2, 3, 4]}
            rows={(sum.by_zone || []).map((z) => [z.zone, fmtInt(z.berths), fmtInt(z.calls), fmtInt(z.incidents), hrs(z.avg_waiting_hr)])} />
        </Card>
      </div>

      <div className="grid two">
        <Card title="Longest pre-berthing waits" cap="Berths where ships queue longest at anchorage. Click to open the berth portal.">
          <DataTable columns={["Berth", "Terminal", "Avg wait", "Calls", "Incidents"]} numeric={[2, 3, 4]}
            rows={(sum.worst_waiting || []).map((f) => [<RecordLink type="facility" id={f.berth} />, f.terminal, hrs(f.avg_waiting_hr), fmtInt(f.calls), fmtInt(f.incidents)])} />
        </Card>
        <Card title="Best berth-on-arrival service" cap="Highest share of calls berthed within 6 hours of arrival — the internal benchmark to copy.">
          <DataTable columns={["Berth", "Terminal", "Berthed <6h", "Calls"]} numeric={[2, 3]}
            rows={(sum.best_service || []).map((f) => [<RecordLink type="facility" id={f.berth} />, f.terminal, pct(f.berthed_lt6h_pct), fmtInt(f.calls)])} />
        </Card>
      </div>

      <Card title="Highest incident load" cap="Where HSE incidents concentrate — with the high/critical share and any PSC detentions at the berth.">
        <DataTable columns={["Berth", "Terminal", "Incidents", "High / critical", "Detentions"]} numeric={[2, 3, 4]}
          rows={(sum.top_incidents || []).map((f) => [<RecordLink type="facility" id={f.berth} />, f.terminal, fmtInt(f.incidents), fmtInt(f.high_critical), fmtInt(f.detentions)])} />
      </Card>

      <h3 style={{ margin: "26px 0 12px", fontSize: 16 }}>{tr("All berths")}</h3>
      <Card pad={false}>
        <div className="ml-bar">
          <input className="ml-search" value={qLive} onChange={(e) => setQLive(e.target.value)} placeholder={tr("Search berth or terminal…")} />
          <select className="sel" value={btype} onChange={(e) => { setBtype(e.target.value); setPage(1); }}>
            <option value="">{tr("All types")}</option>
            {["CONTAINER", "BULK", "COAL", "LIQUID", "SPM", "RORO", "MULTIPURPOSE"].map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <select className="sel" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            <option value="wait">{tr("Sort: longest wait")}</option>
            <option value="calls">{tr("Most calls")}</option>
            <option value="cargo">{tr("Most cargo")}</option>
            <option value="incidents">{tr("Most incidents")}</option>
            <option value="occupancy">{tr("Highest occupancy")}</option>
            <option value="berth">{tr("Name")}</option>
          </select>
          <span className="ml-count">{list ? tr("{n} berths", { n: fmtInt(list.total) }) : ""}</span>
        </div>
        {!list ? <Loading /> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{tr("Berth")}</th><th>{tr("Terminal")}</th><th>{tr("Type")}</th><th>{tr("Calls")}</th><th>{tr("Cargo MT")}</th><th>{tr("Avg wait")}</th><th>{tr("Turnaround")}</th><th>{tr("Occupancy")}</th><th>{tr("Incidents")}</th><th>{tr("Detentions")}</th></tr></thead>
              <tbody>
                {list.rows.map((f) => (
                  <tr key={f.berth}>
                    <td><RecordLink type="facility" id={f.berth} /></td>
                    <td>{f.terminal}</td>
                    <td>{f.btype}</td>
                    <td className="num">{fmtInt(f.calls)}</td>
                    <td className="num">{fmtInt(f.cargo_mt)}</td>
                    <td className="num" style={{ color: f.avg_waiting_hr > 18 ? "var(--crit)" : undefined }}>{hrs(f.avg_waiting_hr)}</td>
                    <td className="num">{hrs(f.avg_turnaround_hr)}</td>
                    <td className="num">{pct(f.occupancy_pct)}</td>
                    <td className="num">{fmtInt(f.incidents)}</td>
                    <td className="num">{f.detentions ? fmtInt(f.detentions) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="ml-pager">
          <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tr("← Prev")}</button>
          <span>{tr("page {p} of {n}", { p: page, n: fmtInt(pages) })}</span>
          <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>{tr("Next →")}</button>
        </div>
      </Card>
      <Hint>Click any berth for its dedicated portal — dashboard, recent calls, top vessels, incidents and its own AI analyst.</Hint>
    </>
  );
}

export default function Districts() {
  const { t: tr } = useLang();
  const [tab, setTab] = useState("facilities");
  return (
    <>
      <PageHeader title="Port Explorer"
        sub="All 24 berths and 10 terminals of Mundra as one portfolio — benchmark them, find the queues and the hotspots, and open any berth's full analytics portal. Every row is a live, drillable record." />
      <div className="dash-tabs">
        <button className={tab === "facilities" ? "on" : ""} onClick={() => setTab("facilities")}>▤ {tr("Berths")}</button>
        <button className={tab === "region" ? "on" : ""} onClick={() => setTab("region")}>☷ {tr("Port Benchmark")}</button>
        <button className={tab === "twin" ? "on" : ""} onClick={() => setTab("twin")}>⬢ {tr("Terminal Twin — 3D")}</button>
      </div>
      {tab === "facilities" && <FacilitiesTab />}
      {tab === "region" && <RegionTab />}
      {tab === "twin" && <TwinTab />}
    </>
  );
}
