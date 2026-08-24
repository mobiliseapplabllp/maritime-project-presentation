import React from "react";
import { useApi } from "../lib/useApi.js";
import { StatTile, Card, PageHeader, Loading, Hint, FindingCard, fmtInt } from "../components/ui.jsx";
import { TrendLine } from "../components/charts.jsx";
import { useLang } from "../lib/i18n.jsx";

const crore = (v) => (v == null ? "—" : "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " Cr");
const mmt = (v) => (v == null ? "—" : (v / 1e6).toFixed(2) + " MMT");
const hr = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}h`);

export default function Dashboard() {
  const { data, loading } = useApi("/overview");
  const { t } = useLang();
  const findings = useApi("/findings");

  if (loading || !data) return <Loading />;
  const k = data.kpis;
  const sc = data.scope || {};
  const authorityLens = sc.persona === "authority";
  const series = (data.home_series || []).map((d) => ({
    ym: (d.ym || "").slice(2),
    turnaround: d.avg_turnaround_hr,
    waiting: d.avg_waiting_hr,
  }));
  const highFindings = (findings.data?.findings || []).filter((f) => f.severity === "high").slice(0, 3);
  const taTone = k.avg_turnaround_hr != null && k.avg_turnaround_hr <= (k.turnaround_target_hr || 50.4) ? "good" : "crit";

  return (
    <>
      <PageHeader
        title={t("{u} — port overview", { u: sc.unit_name || "Mundra Port" })}
        sub={authorityLens
          ? t("Port authority view for {org} — vessel traffic, berth performance, HSE and receivables across your scope ({n} berths, {span}).", { org: sc.org, n: data.meta.berths, span: data.meta.generated_span?.replace("..", " – ") })
          : t("Terminal operator view for {org} — traffic, service levels, incidents and dues across your scope ({n} berths, {span}).", { org: sc.org, n: data.meta.berths, span: data.meta.generated_span?.replace("..", " – ") })} />

      <div className="grid kpis" style={{ marginBottom: 20 }}>
        <StatTile label={`${t("Vessel calls")} · ${data.latest_month}`} value={fmtInt(k.vessel_calls_month)}
          note={t("completed in the latest month")} tone="accent" />
        <StatTile label={t("Cargo handled")} value={mmt(k.cargo_mt)} note={t("{n} MT across all commodities", { n: fmtInt(k.cargo_mt) })} tone="accent" />
        <StatTile label={t("Containers")} value={fmtInt(k.teu)} note={t("TEU, latest month")} tone="accent" />
        <StatTile label={t("Avg turnaround")} value={hr(k.avg_turnaround_hr)}
          note={t("major-port benchmark {n}h", { n: k.turnaround_target_hr })} tone={taTone} />
        <StatTile label={t("Avg pre-berthing wait")} value={hr(k.avg_waiting_hr)}
          note={t("target {n}h · {p}% berthed <6h", { n: k.preberthing_target_hr, p: k.berthed_lt6h_pct })} tone="warn" />
        <StatTile label={t("Berth occupancy")} value={k.occupancy_pct != null ? `${k.occupancy_pct.toFixed(1)}%` : "—"}
          note={t("healthy band 40–70%")} tone="accent" />
        <StatTile label={t("Incidents")} value={fmtInt(k.incidents_month)}
          note={t("{n} high / critical", { n: fmtInt(k.incidents_high_critical) })} tone={k.incidents_high_critical > 0 ? "crit" : "good"} />
        <StatTile label={t("PSC detentions")} value={fmtInt(k.detentions)} note={t("latest month")} tone={k.detentions > 0 ? "crit" : "good"} />
        <StatTile label={t("Outstanding dues")} value={crore(k.outstanding_cr)}
          note={t("collection {n}%", { n: k.collection_pct })} tone={k.outstanding_cr > 0 ? "warn" : "good"} />
      </div>

      <Card title={t("Turnaround & waiting over time vs the major-port benchmark")}
        cap={t("Average hours per call each month. The dashed line is the Indian major-port average turnaround — everything above it is time ships spend at Mundra beyond the benchmark.")}>
        <TrendLine
          data={series} suffix="h"
          lines={[
            { key: "turnaround", name: t("Avg turnaround (h)"), color: "var(--accent)" },
            { key: "waiting", name: t("Avg waiting (h)"), color: "var(--warn, var(--gold))" },
          ]}
          refs={[{ y: k.turnaround_target_hr || 50.4, label: t("Benchmark {n}h", { n: k.turnaround_target_hr || 50.4 }), color: "var(--gold)" }]}
        />
      </Card>

      <h3 style={{ margin: "26px 0 14px", fontSize: 16 }}>{t("Top operations & compliance findings")}</h3>
      <div className="grid cards">
        {highFindings.map((f) => <FindingCard key={f.id} f={f} />)}
      </div>

      <div style={{ marginTop: 22 }}>
        <Hint>
          {authorityLens
            ? "This is the port authority's view of how the terminals are performing — traffic, service levels, safety and money. Explore Operations Audit and Benchmark vs Major Ports for the evidence, or ask Sagar Intelligence (bottom-right)."
            : "This is your terminal view of traffic, service levels, incidents and dues. Explore Operations Audit and Terminal Hotspots for where to act first, or ask Sagar Intelligence (bottom-right)."}
        </Hint>
      </div>
    </>
  );
}
