import React from "react";
import { useApi } from "../lib/useApi.js";
import { FindingCard, PageHeader, Loading, Hint } from "../components/ui.jsx";
import { useLang } from "../lib/i18n.jsx";

export default function Anomalies() {
  const { t } = useLang();
  const { data, loading } = useApi("/findings");
  if (loading || !data) return <Loading />;
  const order = { high: 0, medium: 1, low: 2 };
  const findings = [...(data.findings || [])].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <>
      <PageHeader
        title="Operations Audit"
        sub="The AI engine flags where berth performance, marine safety and money need attention across the port — anchorage queues, terminal hotspots, incident patterns, PSC exposure and receivables. Sorted by severity."
      />
      <Hint>{t("Each finding is computed from the live port panels. Click a card for the evidence and how it was derived, or ask Sagar Intelligence to go deeper on any of them.")}</Hint>
      <div className="sev-legend">
        <span><i style={{ background: "var(--crit)" }} /> {t("High")}</span>
        <span><i style={{ background: "var(--warn)" }} /> {t("Medium")}</span>
        <span><i style={{ background: "var(--good)" }} /> {t("Low")}</span>
      </div>
      <div className="grid cards">
        {findings.map((f) => <FindingCard key={f.id} f={f} />)}
      </div>
    </>
  );
}
