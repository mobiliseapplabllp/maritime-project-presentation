import React from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Cell, LabelList,
} from "recharts";
import { useLang } from "../lib/i18n.jsx";

function cssv(name, fallback) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
const palette = () => ({
  accent: cssv("--accent", "#0d6e6b"),
  gold: cssv("--gold", "#9a6f16"),
  crit: cssv("--crit", "#c0463b"),
  muted: cssv("--muted", "#5f6763"),
  line: cssv("--line", "#dcded7"),
  ink: cssv("--ink", "#1a2320"),
  surface: cssv("--surface", "#fff"),
});
const SERIES_COLORS = ["--accent", "--gold", "--crit", "--warn"];

function TT({ active, payload, label, suffix }) {
  const p = palette();
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 8,
      padding: "8px 11px", fontSize: 12, boxShadow: "0 4px 16px #0002" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((e, i) => (
        <div key={i} style={{ color: e.color, fontFamily: "var(--mono)" }}>
          {e.name}: {e.value}{suffix || ""}
        </div>
      ))}
    </div>
  );
}

const tick = (p) => ({ fill: p.muted, fontSize: 11, fontFamily: "var(--mono)" });

/**
 * Renders a chart spec emitted by Sagar Intelligence inside a ```chart fenced block.
 * Types: bar {data:[{name,value}],highlight?} · compare {data:[{name,a,b}],a_label,b_label}
 *        line {series:[{name,points:[{x,y}]}]}
 */
export default function ChartBlock({ spec }) {
  const { t } = useLang();
  const p = palette();
  let s = spec;
  if (typeof spec === "string") {
    try { s = JSON.parse(spec); } catch (e) { return <pre className="chartblock-err">{spec}</pre>; }
  }
  if (!s || typeof s !== "object") return null;
  const unit = s.unit || "";

  let body = null;
  if (s.type === "bar" && Array.isArray(s.data) && s.data.length) {
    const data = s.data.slice(0, 14);
    const h = Math.max(150, data.length * 28 + 30);
    body = (
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 46, left: 6, bottom: 4 }}>
          <CartesianGrid stroke={p.line} horizontal={false} />
          <XAxis type="number" tick={tick(p)} tickLine={false} axisLine={false}
            tickFormatter={(v) => `${v}${unit}`} />
          <YAxis type="category" dataKey="name" width={124} tickLine={false} axisLine={false}
            tick={{ ...tick(p), fontFamily: "var(--font)", fill: p.ink }} />
          <Tooltip content={<TT suffix={unit} />} cursor={{ fill: p.line, opacity: 0.3 }} />
          <Bar dataKey="value" name={s.value_label || t("value")} radius={[0, 4, 4, 0]} maxBarSize={18}>
            {data.map((d, i) => (
              <Cell key={i} fill={s.highlight && d.name === s.highlight ? p.gold : p.accent} />
            ))}
            <LabelList dataKey="value" position="right" formatter={(v) => `${v}${unit}`}
              style={{ fill: p.muted, fontSize: 11, fontFamily: "var(--mono)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  } else if (s.type === "compare" && Array.isArray(s.data) && s.data.length) {
    const data = s.data.slice(0, 12);
    const h = Math.max(170, data.length * 44 + 40);
    body = (
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 46, left: 6, bottom: 4 }}>
          <CartesianGrid stroke={p.line} horizontal={false} />
          <XAxis type="number" tick={tick(p)} tickLine={false} axisLine={false}
            tickFormatter={(v) => `${v}${unit}`} />
          <YAxis type="category" dataKey="name" width={124} tickLine={false} axisLine={false}
            tick={{ ...tick(p), fontFamily: "var(--font)", fill: p.ink }} />
          <Tooltip content={<TT suffix={unit} />} cursor={{ fill: p.line, opacity: 0.3 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="a" name={s.a_label || t("A")} fill={p.accent} radius={[0, 4, 4, 0]} maxBarSize={13} />
          <Bar dataKey="b" name={s.b_label || t("B")} fill={p.gold} radius={[0, 4, 4, 0]} maxBarSize={13} />
        </BarChart>
      </ResponsiveContainer>
    );
  } else if (s.type === "line" && Array.isArray(s.series) && s.series.length) {
    // merge series on x
    const xs = [];
    const seen = new Set();
    s.series.forEach((se) => (se.points || []).forEach((pt) => {
      if (!seen.has(pt.x)) { seen.add(pt.x); xs.push(pt.x); }
    }));
    xs.sort();
    const data = xs.map((x) => {
      const row = { x };
      s.series.forEach((se) => {
        const pt = (se.points || []).find((q) => q.x === x);
        if (pt) row[se.name] = pt.y;
      });
      return row;
    });
    body = (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 14, left: -8, bottom: 4 }}>
          <CartesianGrid stroke={p.line} vertical={false} />
          <XAxis dataKey="x" tick={tick(p)} tickLine={false} axisLine={{ stroke: p.line }} minTickGap={28} />
          <YAxis tick={tick(p)} tickLine={false} axisLine={false} width={42}
            tickFormatter={(v) => `${v}${unit}`} />
          <Tooltip content={<TT suffix={unit} />} />
          {s.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {s.series.slice(0, 4).map((se, i) => (
            <Line key={se.name} type="monotone" dataKey={se.name} strokeWidth={2.4} dot={false}
              connectNulls stroke={cssv(SERIES_COLORS[i % SERIES_COLORS.length], p.accent)} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (!body) return null;
  return (
    <div className="chartblock">
      {s.title && <div className="chartblock-title">{s.title}</div>}
      {body}
      {s.source && <div className="chartblock-src">{s.source}</div>}
    </div>
  );
}
