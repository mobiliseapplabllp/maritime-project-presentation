import React from "react";
import { useApi } from "../lib/useApi.js";
import { Card, PageHeader, Loading, FindingCard } from "../components/ui.jsx";
import { TrendLine } from "../components/charts.jsx";
import { useLang } from "../lib/i18n.jsx";

export default function Predictions() {
  const { t } = useLang();
  const { data, loading } = useApi("/predictions");
  if (loading || !data) return <Loading />;
  const trend = (data.wait_trend || []).map((d) => ({
    ym: (d.ym || "").slice(2), waiting: d.avg_waiting_hr, turnaround: d.avg_turnaround_hr,
  }));
  const proj = data.projection;
  const findings = data.findings || [];

  return (
    <>
      <PageHeader
        title="Early Warning"
        sub="Where anchorage waiting is heading. The average pre-berthing wait is the leading indicator of congestion — a rising trend predicts queues, demurrage claims and pressure on berth windows next cycle."
      />
      {proj && (
        <div className="grid kpis" style={{ marginBottom: 18 }}>
          <div className="card kpi"><div className="stripe s-warn" /><div className="lab">{t("Projected avg waiting (next month)")}</div><div className="val">{t("{n}h", { n: proj.next_month_avg_waiting_hr })}</div><div className="note">{t("linear fit, last 12 months")}</div></div>
          <div className="card kpi"><div className={`stripe ${proj.slope_hr_per_month > 0 ? "s-crit" : "s-good"}`} /><div className="lab">{t("Trend")}</div><div className="val">{t("{n}h/mo", { n: (proj.slope_hr_per_month > 0 ? "+" : "") + proj.slope_hr_per_month })}</div><div className="note">{proj.slope_hr_per_month > 0 ? t("worsening") : t("improving")}</div></div>
        </div>
      )}
      <Card title="Anchorage waiting over time"
        cap="Average hours at anchorage before berthing, for your scope, with turnaround alongside. A rising waiting line means growing queues and congestion risk.">
        <TrendLine data={trend} suffix="h"
          lines={[
            { key: "waiting", name: t("Avg waiting (h)"), color: "var(--crit)" },
            { key: "turnaround", name: t("Avg turnaround (h)"), color: "var(--accent)" },
          ]} />
      </Card>
      {findings.length > 0 && (
        <>
          <h3 style={{ margin: "24px 0 12px", fontSize: 15 }}>{t("Early-warning findings")}</h3>
          <div className="grid cards">{findings.map((f) => <FindingCard key={f.id} f={f} />)}</div>
        </>
      )}
    </>
  );
}
