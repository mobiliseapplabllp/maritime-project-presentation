import React, { useState } from "react";
import { useApi } from "../lib/useApi.js";
import { Card, PageHeader, Loading, Hint, DataTable, fmtInt } from "../components/ui.jsx";
import { useLang } from "../lib/i18n.jsx";

export default function InterestingFacts() {
  const { t } = useLang();
  const { data, loading } = useApi("/facts");
  const [openHow, setOpenHow] = useState(null);
  if (loading || !data) return <Loading text="Mining the port data…" />;
  const facts = data.facts || [];
  const perYear = data.per_year || {};
  const years = Object.keys(perYear).sort();
  return (
    <>
      <PageHeader title="Interesting Facts"
        sub={data.generated_at
          ? t("Ten things nobody can see in a report — they only exist between the lines, and only analysis finds them. Owned and renewed daily by the Facts Curator agent · last renewed {ts}.", { ts: String(data.generated_at).slice(0, 16).replace("T", " ") })
          : t("Ten things nobody can see in a report — they only exist between the lines, and only analysis finds them. Owned and renewed daily by the Facts Curator agent.")} />
      {facts.length > 0 && (
        <div className="facts-grid">
          {facts.map((f, i) => (
            <div className="fact-card" key={i}>
              <div className="fact-top">
                <span className="fact-emoji">{f.emoji}</span>
                <span className="fact-n">#{i + 1}</span>
              </div>
              <div className="fact-headline">{f.headline}</div>
              <div className="fact-stat">{f.stat}</div>
              <div className="fact-story">{f.story}</div>
              <button className="fact-how-btn" onClick={() => setOpenHow(openHow === i ? null : i)}>
                {openHow === i ? `▾ ${t("how we found it")}` : `▸ ${t("how we found it")}`}
              </button>
              {openHow === i && <div className="fact-how">{f.how}</div>}
            </div>
          ))}
        </div>
      )}
      {facts.length === 0 && years.length > 0 && (
        <Card title="While the Curator writes — the traffic story so far"
          cap="Curated facts land after the Facts Curator's next daily run. Until then, the raw year-on-year traffic picture:">
          <DataTable columns={["Year", "Vessel calls", "Cargo (MMT)", "TEU", "Avg turnaround"]}
            numeric={[1, 2, 3, 4]}
            rows={years.map((y) => {
              const r = perYear[y] || {};
              return [y, fmtInt(r.vessel_calls), r.cargo_mmt, fmtInt(r.teu), r.avg_turnaround_hr != null ? `${r.avg_turnaround_hr}h` : "—"];
            })} />
        </Card>
      )}
      <div style={{ marginTop: 18 }}>
        <Hint>Each fact is a live query, not a slide — the numbers update as the harvest cycles land.
          Ask Sagar Intelligence (bottom-right) to go deeper on any of them.</Hint>
      </div>
    </>
  );
}
