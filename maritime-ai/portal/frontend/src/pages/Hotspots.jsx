import React from "react";
import { useApi } from "../lib/useApi.js";
import { Card, PageHeader, Loading, DataTable, fmtInt } from "../components/ui.jsx";
import { useLang } from "../lib/i18n.jsx";

const VTYPE_LABEL = { CONT: "Container", BULK: "Dry bulk", TANK: "Tanker", GEN: "General cargo", RORO: "Ro-Ro" };

export default function Hotspots() {
  const { t } = useLang();
  const { data, loading } = useApi("/hotspots");
  if (loading || !data) return <Loading />;
  const rel = data.vessel_reliability || [];
  const worst = data.worst_waiting_units || [];
  const busiest = data.highest_load_units || [];

  const relCols = ["Vessel type", "Calls", "Avg turnaround", "Incidents / 100 calls", "Detention rate", "Findings / inspection"];
  const relRows = rel.map((d) => [
    VTYPE_LABEL[d.vessel_type] || d.vessel_type, fmtInt(d.calls),
    d.avg_turnaround_hr != null ? t("{n}h", { n: d.avg_turnaround_hr.toFixed(0) }) : "—",
    d.incidents_per_100_calls != null ? d.incidents_per_100_calls : "—",
    d.detention_rate_pct != null ? `${d.detention_rate_pct}%` : "—",
    d.avg_findings_per_inspection ?? "—",
  ]);
  const uCols = ["Unit", "Avg wait", "Turnaround", "Calls", "Cargo MT", "Incidents", "Detentions"];
  const uRow = (u) => [
    u.unit_name,
    u.avg_waiting_hr != null ? t("{n}h", { n: u.avg_waiting_hr.toFixed(1) }) : "—",
    u.avg_turnaround_hr != null ? t("{n}h", { n: u.avg_turnaround_hr.toFixed(1) }) : "—",
    fmtInt(u.vessel_calls),
    fmtInt(u.cargo_mt),
    fmtInt(u.incidents_total),
    fmtInt(u.detentions),
  ];

  return (
    <>
      <PageHeader
        title="Terminal Hotspots"
        sub="Where marine-services effort should concentrate — the vessel types that generate the most incidents and detentions per call, and the units where ships wait longest at anchorage in your scope."
      />
      <Card title="Vessel-type reliability"
        cap="Incidents per 100 calls, PSC detention rate and inspection findings by vessel type over the full history. Tankers and bulkers tend to top this list.">
        <DataTable columns={relCols} rows={relRows} numeric={[1, 2, 3, 4, 5]} />
      </Card>
      <Card title="Longest anchorage waits (your scope)"
        cap="Units furthest above the 5-hour pre-berthing target — the near-term queue and demurrage risk.">
        <DataTable columns={uCols} rows={worst.map(uRow)} numeric={[1, 2, 3, 4, 5, 6]} />
      </Card>
      <Card title="Heaviest traffic (your scope)"
        cap="Where the calls and cargo concentrate — pressure on pilots, tugs and berth windows follows this list.">
        <DataTable columns={uCols} rows={busiest.map(uRow)} numeric={[1, 2, 3, 4, 5, 6]} />
      </Card>
    </>
  );
}
