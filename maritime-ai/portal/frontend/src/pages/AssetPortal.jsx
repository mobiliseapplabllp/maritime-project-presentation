import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useLang } from "../lib/i18n.jsx";
import { api } from "../lib/api.js";
import { Card, Loading, StatTile, Hint, fmtInt } from "../components/ui.jsx";
import { TrendLine } from "../components/charts.jsx";
import Markdown from "../components/Markdown.jsx";
import { RecordLink } from "../components/RecordDrawer.jsx";
import ReportActions from "../components/ReportActions.jsx";
import LiveTwin from "../components/LiveTwin.jsx";

const dt = (v) => (v ? String(v).slice(0, 10) : "—");
const hrs = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}h`);
const VTYPE_LABEL = { CONT: "Container", BULK: "Dry bulk", TANK: "Tanker", GEN: "General cargo", RORO: "Ro-Ro" };

// route stays /asset/:barcode — the param carries the vessel's IMO number
const NAV = [
  { section: "Vessel" },
  { id: "overview", label: "Dashboard", ic: "▚" },
  { id: "twin", label: "Digital Twin", ic: "🧊" },
  { section: "Operations" },
  { id: "calls", label: "Port Calls", ic: "⚓" },
  { id: "inspections", label: "Inspections", ic: "◇" },
  { id: "incidents", label: "Incidents", ic: "▲" },
  { section: "Compliance" },
  { id: "certs", label: "Certificates", ic: "◬" },
  { id: "risk", label: "Risk & Watchlist", ic: "◔" },
  { section: "Knowledge" },
  { id: "ai", label: "AI Analyst", ic: "✦" },
];

function DigitalTwin({ vesselName, vesselType }) {
  const { t } = useLang();
  const [twin, setTwin] = useState(undefined);   // undefined = loading, null = none
  const [ang, setAng] = useState(0);
  const [live3d, setLive3d] = useState(false);   // interactive WebRTC stream open?
  useEffect(() => {
    let live = true;
    setTwin(undefined); setAng(0); setLive3d(false);
    api.get(`/records/twins/resolve?device=${encodeURIComponent(vesselName || "")}&group=${encodeURIComponent(vesselType || "")}`)
      .then((d) => live && setTwin(d.twin || null))
      .catch(() => live && setTwin(null));
    return () => { live = false; };
  }, [vesselName, vesselType]);

  if (twin === undefined) return <Loading text="Loading digital twin…" />;
  if (!twin) {
    return (
      <div className="ap-twin">
        <div className="ap-twin-stage">
          <div className="ap-twin-glyph">🧊</div>
          <div><b>{vesselName}</b></div>
          <div className="ap-twin-note">
            {t("An interactive 3D twin for this vessel class is on the roadmap — rendered on the port's Omniverse GPU server, with a live status overlay (at anchorage / alongside / under PSC detention). This stage is reserved for it.")}
          </div>
        </div>
      </div>
    );
  }
  const angles = twin.angles || [];
  const hasStream = !!(twin.stream && twin.stream.host);
  return (
    <div className="tw-viewer">
      {live3d && hasStream ? (
        <LiveTwin stream={twin.stream} name={twin.name} onClose={() => setLive3d(false)} />
      ) : (
      <div className="tw-main">
        {angles[ang] && <img className="tw-hero" src={angles[ang].url} alt={twin.name} />}
        <span className="tw-badge">● {t(twin.status === "live" ? "LIVE TWIN" : "TWIN — WIP")}</span>
        {twin.engine && <span className="tw-engine">{twin.engine}</span>}
        {hasStream && (
          <button type="button" className="tw-launch" onClick={() => setLive3d(true)}>
            <span className="tw-launch-play">▶</span>
            <span>{t("Launch live 3D")}</span>
            <span className="tw-launch-sub">{t("Interactive · real-time RTX")}</span>
          </button>
        )}
      </div>
      )}
      {!live3d && angles.length > 1 && (
        <div className="tw-thumbs">
          {angles.map((a, k) => (
            <button key={k} type="button" className={`tw-thumb ${ang === k ? "on" : ""}`} onClick={() => setAng(k)}>
              <img src={a.url} alt={a.label} /><span>{t(a.label)}</span>
            </button>
          ))}
        </div>
      )}
      <div className="tw-meta">
        <div className="tw-name">{twin.name} <span className="tw-forasset">— {vesselName}</span></div>
        {twin.note && <div className="tw-note">{twin.note}</div>}
      </div>
    </div>
  );
}

const CALL_STATUS_TONE = { AT_ANCHORAGE: "var(--warn, var(--gold))", BERTHED: "var(--accent)", SAILED: "var(--muted)" };

export default function AssetPortal() {
  const { barcode: imo } = useParams();   // route param name is historic; the value is the IMO
  const { lang, t } = useLang();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [sec, setSec] = useState("overview");
  const [brief, setBrief] = useState(null);
  const [briefBusy, setBriefBusy] = useState(false);

  useEffect(() => {
    setD(null); setErr(""); setBrief(null); setSec("overview");
    api.get(`/records/asset/${imo}`).then(setD).catch((e) => setErr(e.message));
  }, [imo]);

  const runBrief = async (force = 0) => {
    setBriefBusy(true);
    try {
      const r = await api.get(`/records/analysis/asset/${imo}${force ? "?force=1" : ""}`);
      setBrief(r.report);
    } catch (e) { setBrief(`_${e.message}_`); }
    setBriefBusy(false);
  };

  // re-generate an already-shown brief in the newly selected language
  useEffect(() => { if (brief) runBrief(); }, [lang]);   // eslint-disable-line react-hooks/exhaustive-deps

  // waiting/turnaround averages over the completed calls
  const callStats = useMemo(() => {
    if (!d) return null;
    const done = (d.calls || []).filter((c) => c.turnaround_hr != null);
    const avg = (k) => (done.length ? done.reduce((s, c) => s + (c[k] || 0), 0) / done.length : null);
    return { n: done.length, wait: avg("waiting_hr"), turn: avg("turnaround_hr") };
  }, [d]);

  if (err) return <Card>{err}</Card>;
  if (!d) return <Loading text={`Loading vessel ${imo}…`} />;
  const i = d.identity, x = d.intel || {};
  const fc = d.risk_forecast;
  const certsExpired = (d.certificates || []).filter((c) => c.expired).length;
  const watchTone = i.watch_score == null ? "good" : i.watch_score >= 50 ? "crit" : "warn";

  return (
    <div className="ap-shell">
      <aside className="ap-nav">
        <button className="btn" onClick={() => nav(-1)}>{t("← Back")}</button>
        <div className="ap-id">
          <div className="ap-bc">◈ IMO {i.imo}</div>
          <div className="ap-dev">{i.vessel}</div>
          <div className="ap-fac">{VTYPE_LABEL[i.type] || i.type} · {i.flag}</div>
          <div className="ap-chips">
            <span className={`ap-chip ${i.liner ? "" : ""}`}>{i.liner ? t("liner service") : t("tramp caller")}</span>
            <span className="ap-chip">{fmtInt(i.dwt)} DWT</span>
            {i.watch_score != null && <span className="ap-chip crit">{t("⚠ watchlist {n}", { n: i.watch_score })}</span>}
          </div>
        </div>
        {NAV.map((n, k) => n.section
          ? <div className="ap-sec" key={k}>{t(n.section)}</div>
          : <button key={k} className={`ap-link ${sec === n.id ? "on" : ""}`}
              onClick={() => { setSec(n.id); if (n.id === "ai" && !brief && !briefBusy) runBrief(); }}>
              <span className="ic">{n.ic}</span> {t(n.label)}
            </button>)}
      </aside>

      <main className="ap-main">
        {sec === "overview" && (<>
          <h2 className="ap-h">{t("Vessel dashboard")} <span style={{ color: "var(--accent)", fontWeight: 700 }}>— {i.vessel}{i.imo ? ` (IMO ${i.imo})` : ""}</span></h2>
          <ReportActions kind="vessel" scope={i.imo} />
          {i.watch_score != null && (
            <div className="ap-banner">⚠ <b>{t("On the vessel watchlist")}</b> — {t("watch score {n}: {inc} incidents, {f} inspection findings and {det} detention(s) across {c} calls. Review before the next berth allocation.", { n: i.watch_score, inc: fmtInt(i.incidents), f: fmtInt(i.findings), det: fmtInt(i.detentions), c: fmtInt(i.calls) })}</div>
          )}
          <div className="grid kpis" style={{ marginBottom: 16 }}>
            <StatTile label="Port calls" value={fmtInt(i.calls)} note={t("first {a} · last {b}", { a: dt(i.first_call), b: dt(i.last_call) })} />
            <StatTile label="Cargo across all calls" value={`${fmtInt(i.cargo_mt)} MT`} note={t("dominant terminal {n}", { n: i.dominant_terminal || "—" })} tone="accent" />
            <StatTile label="Avg waiting / turnaround" value={callStats?.turn != null ? `${hrs(callStats.wait)} / ${hrs(callStats.turn)}` : "—"} note={t("over {n} completed calls", { n: fmtInt(callStats?.n) })} tone="warn" />
            <StatTile label="Incidents" value={fmtInt(i.incidents)} note={t("across the call history")} tone={i.incidents > 0 ? "warn" : "good"} />
            <StatTile label="Inspections" value={fmtInt(i.inspections)} note={t("{a} of {b} findings closed", { a: fmtInt(i.findings_closed), b: fmtInt(i.findings) })} />
            <StatTile label="PSC detentions" value={fmtInt(i.detentions)} note={t("Indian Ocean MoU benchmark ≈ 5.6%")} tone={i.detentions > 0 ? "crit" : "good"} />
          </div>
          <div className="grid two">
            <Card title="Identity & particulars">
              <table className="dtable"><tbody>
                <tr><td>{t("Built")}</td><td><b>{i.built || "—"}</b></td><td>{t("Yard")}</td><td><b>{i.yard || "—"}</b></td></tr>
                <tr><td>{t("DWT / GRT")}</td><td><b>{fmtInt(i.dwt)} / {fmtInt(i.grt)}</b></td><td>{t("LOA × beam")}</td><td><b>{i.loa || "—"}m × {i.beam || "—"}m</b></td></tr>
                <tr><td>{t("Max draft")}</td><td><b>{i.max_draft || "—"}m</b></td><td>{t("TEU capacity")}</td><td><b>{i.teu_capacity ? fmtInt(i.teu_capacity) : "—"}</b></td></tr>
                <tr><td>{t("Flag / registry")}</td><td colSpan={3}><b>{i.flag} · {i.port_of_registry || "—"}</b></td></tr>
                <tr><td>{t("Owner")}</td><td colSpan={3}>{i.owner || "—"}</td></tr>
                <tr><td>{t("Operator")}</td><td colSpan={3}><b>{i.operator || "—"}</b></td></tr>
                <tr><td>{t("Manager")}</td><td colSpan={3}>{i.manager || "—"}</td></tr>
                <tr><td>{t("Agent at Mundra")}</td><td><b>{i.agent || "—"}</b></td><td>{t("Class")}</td><td><b>{i.class_society || "—"}</b></td></tr>
                <tr><td>{t("P&I club")}</td><td colSpan={3}>{i.pi_club || "—"}</td></tr>
                <tr><td>{t("Drydock")}</td><td colSpan={3}>{t("last {a} · next {b}", { a: dt(i.last_drydock), b: dt(i.next_drydock) })}</td></tr>
              </tbody></table>
            </Card>
            <Card title="Incident risk — next 12 months" cap={fc?.method || ""}>
              {fc ? (<>
                <div className="grid kpis" style={{ marginBottom: 10 }}>
                  <StatTile label="Expected incidents (12 mo)" value={fc.expected_12mo}
                    note={t("range {a} – {b}", { a: fc.low, b: fc.high })} tone={fc.expected_12mo >= 1 ? "crit" : "accent"} explain={false} />
                  <StatTile label="Outlook" value={fc.outlook || "—"} note={t("{n} incidents in the last 12 mo", { n: fmtInt(fc.last12mo_incidents) })} tone={fc.outlook === "rising" ? "crit" : "good"} explain={false} />
                </div>
                <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.55 }}>{fc.reasoning}</p>
              </>) : <Hint>{t("Not enough history for a forecast yet.")}</Hint>}
            </Card>
          </div>
          <IncidentTimeline history={d.incident_history} />
        </>)}

        {sec === "twin" && (<>
          <h2 className="ap-h">{t("Digital twin")}</h2>
          <DigitalTwin vesselName={i.vessel} vesselType={VTYPE_LABEL[i.type] || i.type} />
        </>)}

        {sec === "calls" && (<>
          <h2 className="ap-h">{t("Port calls — full history at Mundra")}</h2>
          <Card pad={false}>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>{t("Call (VCN)")}</th><th>{t("Arrived")}</th><th>{t("Berthed")}</th><th>{t("Sailed")}</th><th>{t("Berth")}</th><th>{t("Waiting")}</th><th>{t("Turnaround")}</th><th>{t("Cargo MT")}</th></tr></thead>
              <tbody>{(d.calls || []).map((c) => (
                <tr key={c.vcn}>
                  <td className="mono" style={{ fontSize: 12 }}>{c.vcn}<div style={{ fontSize: 10.5, color: CALL_STATUS_TONE[c.status] || "var(--muted)" }}>{c.status}</div></td>
                  <td>{dt(c.ata)}</td><td>{dt(c.atb)}</td><td>{dt(c.atd)}</td>
                  <td>{c.berth ? <RecordLink type="facility" id={c.berth} /> : "—"}</td>
                  <td className="num" style={{ color: c.waiting_hr > 24 ? "var(--crit)" : undefined }}>{c.waiting_hr != null ? `${c.waiting_hr}h` : "—"}</td>
                  <td className="num">{c.turnaround_hr != null ? `${c.turnaround_hr}h` : "—"}</td>
                  <td className="num">{fmtInt(c.cargo_mt)}</td>
                </tr>))}
              </tbody></table></div>
          </Card>
        </>)}

        {sec === "inspections" && (<>
          <h2 className="ap-h">{t("Inspections & surveys")}</h2>
          <div className="grid kpis" style={{ marginBottom: 14 }}>
            <StatTile label="Findings closure" value={`${fmtInt(i.findings_closed)} / ${fmtInt(i.findings)}`} note={t("closed / raised")} tone={i.findings_closed >= i.findings ? "good" : "warn"} />
            <StatTile label="Detentions" value={fmtInt(i.detentions)} note={t("across {n} inspections", { n: fmtInt(i.inspections) })} tone={i.detentions > 0 ? "crit" : "good"} />
          </div>
          <Card pad={false}>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>{t("Inspection")}</th><th>{t("Type")}</th><th>{t("Inspector")}</th><th>{t("Planned")}</th><th>{t("Result")}</th><th>{t("Findings")}</th><th>{t("Detention")}</th></tr></thead>
              <tbody>{(d.inspections || []).map((p) => (
                <tr key={p.number}><td><RecordLink type="pm" id={p.number} /></td>
                  <td>{p.type}</td><td>{p.inspector || "—"}</td><td>{dt(p.planned_at)}</td>
                  <td>{p.result || p.status}</td><td className="num">{fmtInt(p.findings)} ({fmtInt(p.findings_closed)} {t("closed")})</td>
                  <td>{p.detention ? "⚠ YES" : "—"}</td></tr>))}
              </tbody></table></div>
          </Card>
        </>)}

        {sec === "incidents" && (<>
          <h2 className="ap-h">{t("Incidents involving this vessel")}</h2>
          <Card pad={false}>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>{t("Incident")}</th><th>{t("Title")}</th><th>{t("Severity")}</th><th>{t("Berth")}</th><th>{t("Reported")}</th><th>{t("Closed")}</th></tr></thead>
              <tbody>{(d.incidents || []).length ? d.incidents.map((x) => (
                <tr key={x.number}><td><RecordLink type="ticket" id={x.number} /></td>
                  <td>{x.title}</td><td>{x.severity}</td>
                  <td>{x.berth ? <RecordLink type="facility" id={x.berth} /> : "—"}</td>
                  <td>{dt(x.reported_at)}</td><td>{dt(x.closed_at)}</td></tr>))
                : <tr><td colSpan={6}>{t("No incidents on record for this vessel.")}</td></tr>}
              </tbody></table></div>
          </Card>
          <IncidentTimeline history={d.incident_history} />
        </>)}

        {sec === "certs" && (<>
          <h2 className="ap-h">{t("Statutory certificates")}</h2>
          {certsExpired > 0 && <div className="ap-banner">⚠ <b>{t("{n} certificate(s) expired", { n: certsExpired })}</b> — {t("expired paper is a PSC detention trigger; renewal sits with the operator.")}</div>}
          <Card pad={false}>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>{t("Certificate")}</th><th>{t("Number")}</th><th>{t("Issuer")}</th><th>{t("Issued")}</th><th>{t("Expiry")}</th><th>{t("Status")}</th></tr></thead>
              <tbody>{(d.certificates || []).map((c, k) => (
                <tr key={k}><td>{c.cert_type}</td><td className="mono" style={{ fontSize: 12 }}>{c.number}</td>
                  <td>{c.issuer}</td><td>{c.issue_date}</td><td>{c.expiry_date}</td>
                  <td style={{ color: c.expired ? "var(--crit)" : "var(--good)" }}>{c.expired ? t("EXPIRED") : t("valid")}</td></tr>))}
              </tbody></table></div>
          </Card>
        </>)}

        {sec === "risk" && (<>
          <h2 className="ap-h">{t("Risk & watchlist standing")}</h2>
          <div className="grid kpis" style={{ marginBottom: 14 }}>
            <StatTile label="Watch score" value={i.watch_score != null ? i.watch_score : t("not listed")} note={t("blend of incidents, findings and detentions per call")} tone={watchTone} />
            <StatTile label="Incidents / year" value={fc?.incidents_per_year ?? "—"} note={t("over {n} years observed", { n: fc?.window_years ?? "—" })} tone="warn" />
            <StatTile label="Expected incidents (12 mo)" value={fc?.expected_12mo ?? "—"} note={fc ? t("range {a} – {b}", { a: fc.low, b: fc.high }) : ""} tone={fc?.expected_12mo >= 1 ? "crit" : "accent"} />
            <StatTile label="Outlook" value={fc?.outlook || "—"} note={fc ? t("{n} incidents in the last 12 mo", { n: fmtInt(fc.last12mo_incidents) }) : ""} tone={fc?.outlook === "rising" ? "crit" : "good"} />
          </div>
          <IncidentTimeline history={d.incident_history} />
          {d.gaps && <Hint>{d.gaps.claims} {d.gaps.ownership ? ` · ${d.gaps.ownership}` : ""}</Hint>}
        </>)}

        {sec === "ai" && (<>
          <h2 className="ap-h">{t("AI analyst")}</h2>
          {briefBusy ? <Loading text="Sagar Intelligence is analysing this vessel…" />
            : brief ? (<>
                <Card><Markdown>{brief}</Markdown></Card>
                <button className="btn" onClick={() => runBrief(1)}>{t("↻ Regenerate")}</button>
              </>)
              : <button className="btn primary" onClick={() => runBrief()}>{t("✦ Generate the vessel brief")}</button>}
        </>)}
      </main>
    </div>
  );
}

function IncidentTimeline({ history }) {
  const data = useMemo(() =>
    (history || []).map((m) => ({ ym: (m.ym || "").slice(2), incidents: m.incidents })), [history]);
  if (!data.length) return null;
  return (
    <Card title="Incident timeline" cap="Incidents per month on this vessel — the trend behind the watch score and forecast.">
      <TrendLine xKey="ym" suffix="" data={data}
        lines={[{ key: "incidents", name: "Incidents / month", color: "var(--crit)" }]} />
    </Card>
  );
}
