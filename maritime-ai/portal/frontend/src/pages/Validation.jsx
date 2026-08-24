import React from "react";
import { useApi } from "../lib/useApi.js";
import { Card, PageHeader, Loading, FindingCard, DataTable, fmtInt } from "../components/ui.jsx";
import { useLang } from "../lib/i18n.jsx";

const crf = (v) => (v == null ? "—" : "₹" + Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }) + " Cr");

export default function Validation() {
  const { t } = useLang();
  const { data, loading } = useApi("/compliance");
  if (loading || !data) return <Loading />;
  const units = data.units || [];
  const cols = ["Unit", "Turnaround", "vs benchmark", "Waiting", "vs target", "Occupancy", "Collection %", "Detentions", "Outstanding"];
  const rows = units.map((u) => [
    u.unit_name,
    u.avg_turnaround_hr != null ? t("{n}h", { n: u.avg_turnaround_hr.toFixed(1) }) : "—",
    u.turnaround_gap != null ? (u.turnaround_gap >= 0 ? "+" : "") + u.turnaround_gap.toFixed(1) + "h" : "—",
    u.avg_waiting_hr != null ? t("{n}h", { n: u.avg_waiting_hr.toFixed(1) }) : "—",
    u.waiting_gap != null ? (u.waiting_gap >= 0 ? "+" : "") + u.waiting_gap.toFixed(1) + "h" : "—",
    u.occupancy_pct != null ? `${u.occupancy_pct.toFixed(1)}%` : "—",
    u.collection_pct != null ? `${u.collection_pct.toFixed(1)}%` : "—",
    fmtInt(u.detentions),
    crf(u.outstanding_cr),
  ]);
  const findings = data.findings || [];
  const tg = data.targets || {};

  return (
    <>
      <PageHeader
        title="Benchmark vs Major Ports"
        sub="Mundra's delivery against the Indian major-port yardsticks — average turnaround per call, the 5-hour pre-berthing norm, the 40–70% healthy occupancy band, berth-day output, the Indian Ocean MoU detention rate and the 95% collection target."
      />
      <div className="grid kpis" style={{ marginBottom: 18 }}>
        <div className="card kpi"><div className="stripe s-crit" /><div className="lab">{t("Units above the turnaround benchmark")}</div><div className="val">{data.breaching_count}</div><div className="note">{t("in your scope, latest month")}</div></div>
        <div className="card kpi"><div className="stripe s-accent" /><div className="lab">{t("Turnaround benchmark")}</div><div className="val">{t("{n}h", { n: tg.turnaround_target_hr ?? 50.4 })}</div><div className="note">{t("Indian major-port average, per call")}</div></div>
        <div className="card kpi"><div className="stripe s-warn" /><div className="lab">{t("Pre-berthing target")}</div><div className="val">{t("{n}h", { n: tg.preberthing_target_hr ?? 5 })}</div><div className="note">{t("occupancy band {a}–{b}% · detention benchmark {d}%", { a: tg.occupancy_low_pct ?? 40, b: tg.occupancy_high_pct ?? 70, d: tg.psc_detention_benchmark_pct ?? 5.6 })}</div></div>
      </div>
      <Card title="Benchmark by unit (worst gap first)"
        cap="Turnaround gap is vs the major-port average (positive = slower than benchmark); waiting gap is vs the 5-hour pre-berthing norm. Collection is vs the 95% target.">
        <DataTable columns={cols} rows={rows} numeric={[1, 2, 3, 4, 5, 6, 7, 8]} />
      </Card>
      {findings.length > 0 && (
        <>
          <h3 style={{ margin: "24px 0 12px", fontSize: 15 }}>{t("Related findings")}</h3>
          <div className="grid cards">{findings.map((f) => <FindingCard key={f.id} f={f} />)}</div>
        </>
      )}
    </>
  );
}
