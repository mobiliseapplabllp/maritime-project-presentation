import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { api } from "../lib/api.js";
import { useApi } from "../lib/useApi.js";
import { Loading, Hint, fmtInt } from "./ui.jsx";
import { TrendLine } from "./charts.jsx";
import ExplainModal from "./ExplainModal.jsx";
import Markdown from "./Markdown.jsx";
import { useLang } from "../lib/i18n.jsx";

/* ---------------- shared helpers ---------------- */

// Projection is computed from the geojson's OWN bounds every time — the port
// terminal footprint spans roughly lon 69.60–69.74 / lat 22.62–22.76 (with the
// two offshore SPM pads to the SW), and nothing here assumes those numbers.
function projectorFor(geojson) {
  // Equirectangular projection. The centre is the mean of the feature centroids —
  // the estate's visual mass — not the bounding-box middle: the port's two SPM pads
  // sit ~13 km offshore, so a bbox centre lands in open water and pushes every
  // quay-side terminal into a corner. Span is then the radius to the furthest
  // vertex, doubled, so the remote pads still stay in frame.
  const pts = [];
  const centroids = [];
  geojson.features.forEach((f) => {
    const g = f.geometry;
    let sx = 0, sy = 0, n = 0;
    (g.type === "Polygon" ? [g.coordinates] : g.coordinates).forEach((poly) => poly.forEach((ring) => {
      ring.forEach(([lon, lat]) => { pts.push([lon, lat]); sx += lon; sy += lat; n += 1; });
    }));
    if (n) centroids.push([sx / n, sy / n]);
  });
  if (!pts.length) pts.push([69.71, 22.74]);
  const src = centroids.length ? centroids : pts;
  const cLon = src.reduce((a, p) => a + p[0], 0) / src.length;
  const cLat = src.reduce((a, p) => a + p[1], 0) / src.length;
  const kx = Math.cos((cLat * Math.PI) / 180);
  const radius = pts.reduce((m, [lon, lat]) => Math.max(
    m, Math.abs(lon - cLon) * kx, Math.abs(lat - cLat)), 0);
  const span = radius * 2 || 1e-6;
  const S = 100 / span;
  const toSvg = ([lon, lat]) => [400 + (lon - cLon) * kx * S * 7.2, 400 + (lat - cLat) * -S * 7.2];
  // svg viewBox derived from the projected extent of every vertex (with padding),
  // so the whole estate is always in frame whatever its aspect ratio
  const xs = pts.map((p) => toSvg(p)[0]);
  const ys = pts.map((p) => toSvg(p)[1]);
  const x1 = Math.min(...xs), x2 = Math.max(...xs);
  const y1 = Math.min(...ys), y2 = Math.max(...ys);
  const pad = 40;
  return {
    toWorld: ([lon, lat]) => [(lon - cLon) * kx * S, -(lat - cLat) * S], // x, z
    toSvg,
    viewBox: `${Math.min(x1, x2) - pad} ${Math.min(y1, y2) - pad} ${Math.abs(x2 - x1) + 2 * pad} ${Math.abs(y2 - y1) + 2 * pad}`,
  };
}

// Default ("home") camera, framed on the quay estate rather than the whole
// projected radius — the port's SPM pads lie ~13 km offshore, so a radius-filling
// view leaves the terminals tiny. Zoom out, or click a pad in the ranking, to
// reach them. Used both at init and by the deselect reset so they can't drift.
const HOME_CAM = [0, 58, 48];

// keys where the twin shows load intensity rather than badness
const LOAD_KEYS = new Set(["vessel_calls", "cargo_mt", "teu"]);

function worseness(data, metricDef) {
  // returns {unit_id: 0..1} where 1 = worst / heaviest (red, tallest)
  const vals = {};
  let lo = Infinity, hi = -Infinity;
  Object.values(data.terminals).forEach((d) => {
    if (d.in_scope === false) return;           // outside the user's scope → grey
    let v = d[metricDef.key];
    if (v == null) return;
    if (metricDef.invert) v = -v;
    vals[d.unit_id] = v;
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  });
  const out = {};
  Object.entries(vals).forEach(([n, v]) => {
    out[n] = hi === lo ? 0.5 : (v - lo) / (hi - lo);
  });
  return out;
}

function heatColor(w) {
  // 0 → green, .5 → amber, 1 → red
  const lerp = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
  const g = [46, 139, 87], a = [228, 179, 60], r = [192, 57, 43];
  const c = w == null ? [148, 148, 148] : w < 0.5 ? lerp(g, a, w * 2) : lerp(a, r, (w - 0.5) * 2);
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function fmtVal(v, def, t = (x) => x) {
  if (v == null) return t("no data");
  if (def.key === "risk") return `${Number(v).toFixed(0)}${def.unit || "/100"}`;
  if (def.key === "vessel_calls" || def.key === "teu" || def.key === "incidents_12m") return fmtInt(v);
  if (def.key === "cargo_mt") return `${fmtInt(v)} MT`;
  if (def.unit === "₹Cr") return `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr`;
  return `${Number(v).toFixed(1)}${def.unit || ""}`;
}

/* ---------------- 3D / isometric view ---------------- */

function ThreeMap({ data, metricDef, mode, selected, onSelect, onHover }) {
  const wrapRef = useRef(null);
  const stateRef = useRef({});

  // build the scene once
  useEffect(() => {
    const wrap = wrapRef.current;
    const W = wrap.clientWidth, H = wrap.clientHeight || 560;
    const proj = projectorFor(data.geojson);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 2000);
    camera.position.set(...HOME_CAM);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    wrap.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.15);
    sun.position.set(-60, 120, 40);
    scene.add(sun);

    // base plate — the sea around the terminals
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(78, 80, 1.6, 64),
      new THREE.MeshStandardMaterial({ color: 0x1d3a4d, roughness: 0.9 }));
    base.position.y = -1.2;
    scene.add(base);

    const meshes = [];
    data.geojson.features.forEach((f) => {
      const uid = f.properties.unit_id;
      const label = f.properties.unit_name || uid;
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      const group = new THREE.Group();
      let cx = 0, cz = 0, np = 0;
      polys.forEach((poly) => {
        const outer = poly[0];
        const shape = new THREE.Shape();
        outer.forEach((pt, i) => {
          const [x, z] = proj.toWorld(pt);
          if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
          cx += x; cz += z; np++;
        });
        for (let h = 1; h < poly.length; h++) {
          const hole = new THREE.Path();
          poly[h].forEach((pt, i) => {
            const [x, z] = proj.toWorld(pt);
            if (i === 0) hole.moveTo(x, z); else hole.lineTo(x, z);
          });
          shape.holes.push(hole);
        }
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
        geo.rotateX(Math.PI / 2);   // extrude upward
        geo.translate(0, 1, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.55, metalness: 0.05 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.userData.uid = uid;
        group.add(mesh);
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo, 30),
          new THREE.LineBasicMaterial({ color: 0x0d1f2b, transparent: true, opacity: 0.35 }));
        edges.scale.y = 1.001;
        mesh.userData.edges = edges;
        group.add(edges);
      });
      group.userData = { uid, label, centroid: [cx / np, cz / np] };
      scene.add(group);
      meshes.push(group);
    });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 25;
    controls.maxDistance = 240;

    const ray = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let hovered = null;

    const pick = (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(ptr, camera);
      const hits = ray.intersectObjects(
        meshes.flatMap((g) => g.children.filter((c) => c.isMesh)));
      return hits.length ? hits[0].object.userData.uid : null;
    };

    const onMove = (e) => {
      const d = pick(e);
      if (d !== hovered) {
        hovered = d;
        stateRef.current.hovered = d;
        wrap.style.cursor = d ? "pointer" : "grab";
        onHover(d ? { uid: d, x: e.clientX, y: e.clientY } : null);
      } else if (d) {
        onHover({ uid: d, x: e.clientX, y: e.clientY });
      }
    };
    // click = pointerdown + pointerup with <6px movement (so rotating never selects)
    let downAt = null;
    const onDown = (e) => { downAt = [e.clientX, e.clientY]; };
    const onUp = (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved < 6) { const d = pick(e); if (d) onSelect(d); }
    };
    const onLeave = () => { hovered = null; onHover(null); };
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    let raf, alive = true;
    const anim = { active: false, t: 0, fromP: new THREE.Vector3(), toP: new THREE.Vector3(),
                   fromT: new THREE.Vector3(), toT: new THREE.Vector3() };
    const labelV = new THREE.Vector3();
    const loop = () => {
      if (!alive) return;
      if (anim.active) {
        anim.t = Math.min(1, anim.t + 0.035);
        const e = 1 - Math.pow(1 - anim.t, 3);
        camera.position.lerpVectors(anim.fromP, anim.toP, e);
        controls.target.lerpVectors(anim.fromT, anim.toT, e);
        if (anim.t >= 1) anim.active = false;
      }
      controls.update();
      // keep the selected terminal's name label pinned above its centroid
      const st = stateRef.current;
      const label = wrap.querySelector(".twin-map-label");
      if (label) {
        const g = st.selectedUid && meshes.find((x) => x.userData.uid === st.selectedUid);
        if (g) {
          const h = (g.children[0]?.scale.y || 1) + 4;
          labelV.set(g.userData.centroid[0], h, g.userData.centroid[1]).project(camera);
          const rect = renderer.domElement.getBoundingClientRect();
          label.style.display = "block";
          label.style.left = `${((labelV.x + 1) / 2) * rect.width}px`;
          label.style.top = `${((-labelV.y + 1) / 2) * rect.height}px`;
          label.textContent = g.userData.label;
        } else {
          label.style.display = "none";
        }
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    const onResize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight || 560;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    stateRef.current = { scene, camera, renderer, controls, meshes, anim, proj };
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      renderer.dispose();
      wrap.removeChild(renderer.domElement);
    };
  }, [data]);                          // eslint-disable-line react-hooks/exhaustive-deps

  // metric → recolour + re-height (spotlight: non-selected go grey)
  useEffect(() => {
    const st = stateRef.current;
    if (!st.meshes) return;
    const w = worseness(data, metricDef);
    st.applyColors = (selectedUid) => {
      st.meshes.forEach((g) => {
        const d = g.userData.uid;
        const ww = w[d];
        const h = ww == null ? 0.6 : 1 + 15 * ww;
        const spot = selectedUid && d !== selectedUid;
        const col = new THREE.Color(spot ? "#5b625e" : heatColor(ww));
        g.children.forEach((c) => {
          if (c.isMesh) {
            c.material.color = col;
            c.material.opacity = spot ? 0.45 : 1;
            c.material.transparent = spot;
            c.scale.y = h;
          }
          if (c.isLineSegments) c.scale.y = h * 1.001;
        });
      });
    };
    st.applyColors(st.selectedUid || null);
  }, [data, metricDef]);

  // selection highlight + spotlight + fly-in
  useEffect(() => {
    const st = stateRef.current;
    if (!st.meshes) return;
    st.selectedUid = selected || null;
    st.applyColors && st.applyColors(st.selectedUid);
    let flew = false;
    st.meshes.forEach((g) => {
      const sel = g.userData.uid === selected;
      g.children.forEach((c) => {
        if (c.isMesh) c.material.emissive = new THREE.Color(sel ? 0x2e5e50 : 0x000000);
      });
      if (sel && !flew) {              // a unit can span two pads (SPM) — fly to the first
        flew = true;
        const [cx, cz] = g.userData.centroid;
        st.anim.fromP.copy(st.camera.position);
        st.anim.fromT.copy(st.controls.target);
        st.anim.toT.set(cx, 2, cz);
        const dir = new THREE.Vector3(cx, 0, cz).sub(new THREE.Vector3(0, 0, 0)).normalize();
        st.anim.toP.set(cx + 14 * (dir.x || 0.4), 26, cz + 14 * (dir.z || 0.4) + 8);
        st.anim.t = 0; st.anim.active = true;
      }
    });
    if (!selected && st.controls) {
      st.anim.fromP.copy(st.camera.position);
      st.anim.fromT.copy(st.controls.target);
      st.anim.toP.set(...HOME_CAM); st.anim.toT.set(0, 0, 0);
      st.anim.t = 0; st.anim.active = true;
    }
  }, [selected]);                      // eslint-disable-line react-hooks/exhaustive-deps

  // 3d vs isometric camera behaviour
  useEffect(() => {
    const st = stateRef.current;
    if (!st.controls) return;
    if (mode === "iso") {
      st.anim.fromP.copy(st.camera.position);
      st.anim.fromT.copy(st.controls.target);
      st.anim.toP.set(58, 74, 58); st.anim.toT.set(0, 0, 0);
      st.anim.t = 0; st.anim.active = true;
      st.controls.enableRotate = false;
    } else {
      st.controls.enableRotate = true;
    }
  }, [mode]);

  return (
    <div className="twin-canvas" ref={wrapRef}>
      <div className="twin-map-label" style={{ display: "none" }} />
    </div>
  );
}

/* ---------------- 2D choropleth ---------------- */

function FlatMap({ data, metricDef, selected, onSelect, onHover }) {
  const proj = useMemo(() => projectorFor(data.geojson), [data]);
  const w = useMemo(() => worseness(data, metricDef), [data, metricDef]);
  const paths = useMemo(() => data.geojson.features.map((f) => {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const d = polys.map((poly) => poly.map((ring) =>
      "M" + ring.map((pt) => proj.toSvg(pt).map((n) => n.toFixed(1)).join(",")).join("L") + "Z"
    ).join(" ")).join(" ");
    // centroid of the largest ring, for the name label
    let big = polys[0][0];
    polys.forEach((poly) => { if (poly[0].length > big.length) big = poly[0]; });
    const pts = big.map((pt) => proj.toSvg(pt));
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return { uid: f.properties.unit_id, label: f.properties.unit_name || f.properties.unit_id, d, cx, cy };
  }), [data, proj]);
  const sel = paths.find((p) => p.uid === selected);

  return (
    <svg className="twin-flat" viewBox={proj.viewBox} onMouseLeave={() => onHover(null)}>
      {paths.map((p, i) => (
        <path key={`${p.uid}-${i}`} d={p.d}
          fill={selected && selected !== p.uid ? "#57605b" : heatColor(w[p.uid])}
          stroke={selected === p.uid ? "#fff" : "#f6f3ec"}
          strokeWidth={selected === p.uid ? 2.5 : 0.9}
          opacity={selected && selected !== p.uid ? 0.5 : 1}
          style={{ cursor: "pointer" }}
          onClick={() => onSelect(p.uid)}
          onMouseMove={(e) => onHover({ uid: p.uid, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => onHover(null)} />
      ))}
      {sel && (
        <g pointerEvents="none">
          <text x={sel.cx} y={sel.cy - 14} className="twin-flat-label-halo">{sel.label}</text>
          <text x={sel.cx} y={sel.cy - 14} className="twin-flat-label">{sel.label}</text>
        </g>
      )}
    </svg>
  );
}

/* ---------------- live hover card (updates as the mouse moves) ---------- */

function HoverCard({ uid, data, metricKey }) {
  const { t } = useLang();
  const d = data.terminals[uid];
  if (!d) return null;
  const rows = [
    ["risk", t("Composite risk"), d.risk != null ? t("{v}/100 · rank #{r}", { v: d.risk.toFixed(0), r: d.risk_rank }) : "—"],
    ["vessel_calls", t("Vessel calls"), d.vessel_calls != null ? fmtInt(d.vessel_calls) : "—"],
    ["cargo_mt", t("Cargo handled"), d.cargo_mt != null ? fmtInt(d.cargo_mt) + " MT" : "—"],
    ["teu", t("Containers (TEU)"), d.teu ? fmtInt(d.teu) : "—"],
    ["avg_waiting_hr", t("Avg pre-berthing wait"), d.avg_waiting_hr != null ? d.avg_waiting_hr.toFixed(1) + "h" : "—"],
    ["avg_turnaround_hr", t("Avg turnaround"), d.avg_turnaround_hr != null ? d.avg_turnaround_hr.toFixed(1) + "h" : "—"],
    ["occupancy_pct", t("Berth occupancy"), d.occupancy_pct != null ? d.occupancy_pct.toFixed(1) + "%" : "—"],
    ["incidents_12m", t("Incidents (12m)"), d.incidents_12m != null ? t("{v} · {h} high/crit", { v: fmtInt(d.incidents_12m), h: fmtInt(d.high_severity_12m) }) : "—"],
    ["outstanding_cr", t("Outstanding dues"), d.outstanding_cr != null ? `₹${d.outstanding_cr.toLocaleString("en-IN", { maximumFractionDigits: 2 })} Cr` : "—"],
  ];
  return (
    <div className="twin-panel hovercard">
      <div className="twin-panel-name">{d.name} {d.in_scope === false && <span className="tribalflag">◫ {t("outside your scope")}</span>}</div>
      <div className="hover-rows">
        {rows.map(([k, label, val]) => (
          <div key={k} className={`hover-row ${k === metricKey ? "active" : ""}`}>
            <span>{label}</span><b>{val}</b>
          </div>
        ))}
      </div>
      <div className="hover-hint">{t("click to pin · fly in for trend & actions")}</div>
    </div>
  );
}

/* ---------------- ranking card (shown on load / when idle) -------------- */

function RankingCard({ data, metricDef, onSelect }) {
  const { t } = useLang();
  const w = worseness(data, metricDef);
  const heavier = LOAD_KEYS.has(metricDef.key);
  const rows = Object.values(data.terminals)
    .filter((d) => d[metricDef.key] != null && d.in_scope !== false)
    .sort((a, b) => (metricDef.invert ? a[metricDef.key] - b[metricDef.key]
                                      : b[metricDef.key] - a[metricDef.key]));
  return (
    <div className="twin-panel rankcard">
      <div className="twin-panel-name" style={{ fontSize: 14 }}>
        {t("Terminal ranking")} — {t(metricDef.label)}
      </div>
      <div className="twin-panel-sub">{heavier ? t("heaviest first · click a terminal to fly in") : t("worst first · click a terminal to fly in")}</div>
      <div className="rank-rows">
        {rows.map((d, i) => (
          <button key={d.unit_id} className="rank-row" onClick={() => onSelect(d.unit_id)}>
            <span className="rank-n">{i + 1}</span>
            <span className="rank-dot" style={{ background: heatColor(w[d.unit_id]) }} />
            <span className="rank-name">{d.name}</span>
            <b>{fmtVal(d[metricDef.key], metricDef, t)}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- drill-down side panel ---------------- */

function TerminalPanel({ uid, data, metricDef, onClose, onFullReport }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const d = data.terminals[uid];
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    api.get(`/units/${encodeURIComponent(uid)}`).then((x) => alive && setDetail(x)).catch(() => {});
    return () => { alive = false; };
  }, [uid]);

  if (!d) return null;
  const series = (detail?.trajectory || []).map((r) => ({ ym: r.ym?.slice(2), v: r.avg_waiting_hr }));

  return (
    <div className="twin-panel">
      <div className="twin-panel-head">
        <div>
          <div className="twin-panel-name">{d.name}</div>
          <div className="twin-panel-sub">{t("Risk rank #{r} · composite risk {v}/100", { r: d.risk_rank, v: d.risk?.toFixed(0) })}</div>
        </div>
        <button className="fd-x" onClick={onClose}>×</button>
      </div>
      <div className="twin-kpis">
        <div><b>{fmtInt(d.vessel_calls)}</b><span>{t("vessel calls")}</span></div>
        <div><b>{d.cargo_mt != null ? fmtInt(Math.round(d.cargo_mt / 1000)) + "k" : "—"}</b><span>{t("cargo MT")}</span></div>
        <div><b>{d.avg_waiting_hr != null ? d.avg_waiting_hr.toFixed(1) + "h" : "—"}</b><span>{t("avg wait")}</span></div>
        <div><b>{d.avg_turnaround_hr != null ? d.avg_turnaround_hr.toFixed(1) + "h" : "—"}</b><span>{t("turnaround")}</span></div>
        <div><b>{fmtInt(d.incidents_12m)}</b><span>{t("incidents (12m)")}</span></div>
        <div><b>{d.outstanding_cr != null ? `₹${d.outstanding_cr} Cr` : "—"}</b><span>{t("outstanding")}</span></div>
      </div>
      {series.length > 3 && (
        <div className="twin-trend">
          <TrendLine data={series} height={150} suffix="h"
            lines={[{ key: "v", name: t("Avg wait (h)"), color: "var(--accent)" }]} />
        </div>
      )}
      <div className="twin-panel-actions">
        <button className="btn" onClick={onFullReport}>{t("Full report")}</button>
        <button className="btn" onClick={() => navigate(`/district/${encodeURIComponent(uid)}`)}>
          {t("Terminal portal →")}
        </button>
      </div>
    </div>
  );
}

/* ---------------- full-report modal ---------------- */

function TerminalModal({ uid, data, onClose }) {
  const { t } = useLang();
  const d = data.terminals[uid];
  const [detail, setDetail] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState(null);

  const explainAI = async () => {
    if (aiBusy || analysis) return;
    setAiBusy(true); setAiErr(null);
    try {
      const r = await api.unitAnalysis(uid);
      setAnalysis(r.report);
    } catch (e) { setAiErr(String(e.message || e)); }
    setAiBusy(false);
  };

  useEffect(() => {
    api.get(`/units/${encodeURIComponent(uid)}`).then(setDetail).catch(() => {});
  }, [uid]);
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!d) return null;
  const series = (detail?.trajectory || []).map((r) => ({
    ym: r.ym?.slice(2), waiting: r.avg_waiting_hr,
    turnaround: r.avg_turnaround_hr, calls: r.vessel_calls,
  }));
  const hse = detail?.hse || {}, marine = detail?.marine || {}, rev = detail?.revenue || {};
  return (
    <div className="fd-overlay" onClick={onClose}>
      <div className="fd-modal explain-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fd-head explain">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="explain-badge">{t("terminal report")}</span>
            <button className="fd-x" onClick={onClose}>×</button>
          </div>
          <div className="fd-title">{d.name}</div>
          <div className="explain-sub">
            {t("Composite risk")} {d.risk?.toFixed(0)}/100 (#{d.risk_rank}) · {detail?.zone || ""} · {t("latest")} {data.latest_ym}
          </div>
        </div>
        <div className="fd-body">
          <div className="twin-kpis modal">
            <div><b>{fmtInt(d.vessel_calls)}</b><span>{t("vessel calls")}</span></div>
            <div><b>{d.cargo_mt != null ? fmtInt(d.cargo_mt) : "—"}</b><span>{t("cargo MT")}</span></div>
            <div><b>{d.teu ? fmtInt(d.teu) : "—"}</b><span>TEU</span></div>
            <div><b>{d.avg_waiting_hr?.toFixed(1)}h</b><span>{t("avg wait")}</span></div>
            <div><b>{d.avg_turnaround_hr?.toFixed(1)}h</b><span>{t("turnaround")}</span></div>
            <div><b>{d.occupancy_pct?.toFixed(1)}%</b><span>{t("occupancy")}</span></div>
            <div><b>{fmtInt(hse.incidents_total ?? d.incidents_12m)}</b><span>{t("incidents")}</span></div>
            <div><b>{fmtInt(marine.detentions ?? d.detentions_12m)}</b><span>{t("detentions")}</span></div>
            <div><b>{rev.outstanding_cr != null ? `₹${rev.outstanding_cr} Cr` : "—"}</b><span>{t("outstanding")}</span></div>
          </div>
          {series.length > 3 && (
            <TrendLine data={series} height={230} suffix=""
              lines={[
                { key: "waiting", name: t("Avg wait (h)"), color: "var(--accent)" },
                { key: "turnaround", name: t("Turnaround (h)"), color: "var(--warn)" },
                { key: "calls", name: t("Calls"), color: "var(--crit)" },
              ]} />
          )}

          {/* AI deep-dive — the full terminal intelligence report */}
          {!analysis && !aiBusy && (
            <div className="dr-ai-cta">
              <button className="btn primary" onClick={explainAI}>
                {t("✨ Explain with AI — full terminal analysis")}
              </button>
              <span>{t("Sagar Intelligence reads every panel for {d} — traffic, waiting, marine services, HSE, receivables, comparisons — and writes the complete intelligence report.", { d: d.name })}</span>
            </div>
          )}
          {aiBusy && (
            <div className="explain-loading">
              <span className="typing"><i /><i /><i /></span>
              <span>{t("Sagar Intelligence is analysing {d} from every angle — traffic, service levels, safety, money, peers…", { d: d.name })}</span>
            </div>
          )}
          {aiErr && <div className="hint">Analysis unavailable: {aiErr}</div>}
          {analysis && (
            <div className="dr-ai-report">
              <div className="ds-sec-h">{t("✨ Sagar Intelligence — terminal intelligence report")}</div>
              <Markdown>{analysis}</Markdown>
              <div className="explain-foot mono" style={{ border: "none", padding: "10px 0 0" }}>
                {t("Generated from the live panels, major-port benchmarks and the AI risk engine · every figure traceable in the Data Catalogue")}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- main component ---------------- */

export default function MundraTwin() {
  const { data, loading, error } = useApi("/heatmap");
  const [mode, setMode] = useState("3d");        // 3d | iso | 2d
  const [metricKey, setMetricKey] = useState("risk");
  const [selected, setSelected] = useState(null);   // terminal unit_id
  const [hover, setHover] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [explain, setExplain] = useState(false);
  const [focus, setFocus] = useState(false);
  const { t } = useLang();

  // focus mode: hide all chrome, the map section fills the screen
  useEffect(() => {
    document.body.classList.toggle("twin-focus", focus);
    window.dispatchEvent(new Event("resize"));   // the 3D canvas re-fits
    return () => document.body.classList.remove("twin-focus");
  }, [focus]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") setFocus(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) return <Loading text="Building the terminal twin…" />;
  if (error || !data) return <Hint>Twin unavailable: {String(error)}</Hint>;

  const metricDef = data.metric_defs.find((m) => m.key === metricKey) || data.metric_defs[0];
  const hoverVal = hover && data.terminals[hover.uid]?.[metricDef.key];
  const hoverName = hover && (data.terminals[hover.uid]?.name || hover.uid);
  const loadMetric = LOAD_KEYS.has(metricDef.key);

  return (
    <div className="twin">
      <div className="twin-toolbar">
        <div className="twin-modes">
          {[["3d", `◧ ${t("3D Twin")}`], ["iso", `◨ ${t("Isometric")}`], ["2d", `▦ ${t("Flat 2D")}`]].map(([k, l]) => (
            <button key={k} className={`seg ${mode === k ? "on" : ""}`} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>
        <div className="twin-metrics">
          {data.metric_defs.map((m) => (
            <button key={m.key} className={`seg ${metricKey === m.key ? "on" : ""}`}
              title={m.desc} onClick={() => setMetricKey(m.key)}>{t(m.label)}</button>
          ))}
        </div>
        <button className="explain-btn" onClick={() => setExplain(true)}>✨ {t("AI explain")}</button>
        <button className="btn focus-btn" onClick={() => setFocus((f) => !f)}>
          {focus ? `⤡ ${t("Exit focus")}` : `⛶ ${t("Focus map")}`}
        </button>
      </div>

      <div className="twin-stage">
        {mode === "2d"
          ? <FlatMap data={data} metricDef={metricDef} selected={selected}
              onSelect={setSelected} onHover={setHover} />
          : <ThreeMap data={data} metricDef={metricDef} mode={mode} selected={selected}
              onSelect={setSelected} onHover={setHover} />}

        <div className="twin-legend">
          <div className="twin-legend-title">{t(metricDef.label)}{metricDef.unit && ` (${metricDef.unit})`}</div>
          <div className="twin-legend-bar" />
          <div className="twin-legend-lab">{loadMetric
            ? <><span>{t("lighter")}</span><span>{t("heavier")}</span></>
            : <><span>{t("better")}</span><span>{t("worse")}</span></>}</div>
          <div className="twin-legend-note">{mode !== "2d" ? t("drag to rotate · scroll to zoom · click a terminal to fly in") : t("click a terminal to drill down")}</div>
        </div>

        {hover && (
          <div className="twin-tip" style={{ left: hover.x + 14, top: hover.y - 10 }}>
            <b>{hoverName}</b> · {fmtVal(hoverVal, metricDef, t)}
          </div>
        )}

        {/* right card: hover = live figures · selected = pinned panel · idle = ranking */}
        {hover && hover.uid !== selected ? (
          <HoverCard uid={hover.uid} data={data} metricKey={metricKey} />
        ) : selected ? (
          <TerminalPanel uid={selected} data={data} metricDef={metricDef}
            onClose={() => setSelected(null)} onFullReport={() => setShowModal(true)} />
        ) : (
          <RankingCard data={data} metricDef={metricDef} onSelect={setSelected} />
        )}
      </div>

      {showModal && selected && (
        <TerminalModal uid={selected} data={data} onClose={() => setShowModal(false)} />
      )}
      {explain && (
        <ExplainModal
          title="Terminal heatmap — 3D twin"
          caption={`Terminals coloured and raised by ${metricDef.label}: ${metricDef.desc}. Data: ${data.latest_ym}.`}
          data={{ metric: metricDef.key, top5: Object.values(data.terminals).sort((a, b) => (b.risk || 0) - (a.risk || 0)).slice(0, 5).map((d) => ({ name: d.name, risk: d.risk })) }}
          page="/twin" onClose={() => setExplain(false)} />
      )}
    </div>
  );
}
