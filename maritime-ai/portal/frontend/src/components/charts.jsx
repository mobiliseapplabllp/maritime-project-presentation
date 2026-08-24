import React from "react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, Cell, LabelList,
} from "recharts";

function cssv(name, fallback) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
const palette = () => ({
  accent: cssv("--accent", "#0d6e6b"),
  gold: cssv("--gold", "#9a6f16"),
  crit: cssv("--crit", "#c0463b"),
  warn: cssv("--warn", "#bd7d1f"),
  muted: cssv("--muted", "#5f6763"),
  line: cssv("--line", "#dcded7"),
  ink: cssv("--ink", "#1a2320"),
  surface: cssv("--surface", "#fff"),
});

const tick = (p) => ({ fill: p.muted, fontSize: 11, fontFamily: "var(--mono)" });

function TT({ active, payload, label, suffix }) {
  const p = palette();
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: p.surface, border: `1px solid ${p.line}`, borderRadius: 8,
      padding: "8px 11px", fontSize: 12, boxShadow: "0 4px 16px #0002" }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {payload.map((e, i) => (
        <div key={i} className="mono" style={{ color: e.color }}>
          {e.name}: {e.value}{suffix || ""}
        </div>
      ))}
    </div>
  );
}

export function TrendLine({ data, lines, refs = [], suffix = "%", height = 300, xKey = "ym" }) {
  const p = palette();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 14, left: -12, bottom: 4 }}>
        <CartesianGrid stroke={p.line} vertical={false} />
        <XAxis dataKey={xKey} tick={tick(p)} tickLine={false} axisLine={{ stroke: p.line }}
          minTickGap={28} />
        <YAxis tick={tick(p)} tickLine={false} axisLine={false} width={40}
          tickFormatter={(v) => `${v}${suffix}`} />
        <Tooltip content={<TT suffix={suffix} />} />
        {refs.map((r, i) => (
          <ReferenceLine key={i} y={r.y} stroke={r.color || p.gold} strokeDasharray="6 4"
            label={{ value: r.label, position: "insideTopRight", fill: r.color || p.gold,
              fontSize: 10, fontFamily: "var(--mono)" }} />
        ))}
        {lines.map((l) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.name} stroke={l.color}
            strokeWidth={2.4} dot={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HBars({ data, dataKey = "v", nameKey = "name", color, suffix = "", height, fmt }) {
  const p = palette();
  const col = color || p.accent;
  const h = height || Math.max(160, data.length * 30 + 20);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 6, bottom: 4 }}>
        <CartesianGrid stroke={p.line} horizontal={false} />
        <XAxis type="number" tick={tick(p)} tickLine={false} axisLine={false}
          tickFormatter={(v) => (fmt ? fmt(v) : v + suffix)} />
        <YAxis type="category" dataKey={nameKey} tick={{ ...tick(p), fontFamily: "var(--font)", fill: p.ink }}
          tickLine={false} axisLine={false} width={112} />
        <Tooltip content={<TT suffix={suffix} />} cursor={{ fill: p.line, opacity: 0.3 }} />
        <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} maxBarSize={20}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.tribal ? p.gold : col} />
          ))}
          <LabelList dataKey={dataKey} position="right" formatter={(v) => (fmt ? fmt(v) : v + suffix)}
            style={{ fill: p.muted, fontSize: 11, fontFamily: "var(--mono)" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GapBars({ data, height }) {
  // data: [{name, gap}] all negative → diverging left
  const p = palette();
  const h = height || Math.max(200, data.length * 22 + 30);
  return (
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 6, bottom: 4 }}>
        <CartesianGrid stroke={p.line} horizontal={false} />
        <XAxis type="number" tick={tick(p)} tickLine={false} axisLine={false}
          tickFormatter={(v) => `${v}`} />
        <YAxis type="category" dataKey="name" tick={{ ...tick(p), fontFamily: "var(--font)", fill: p.ink }}
          tickLine={false} axisLine={false} width={110} />
        <Tooltip content={<TT suffix=" pp" />} cursor={{ fill: p.line, opacity: 0.3 }} />
        <ReferenceLine x={0} stroke={p.muted} />
        <Bar dataKey="gap" radius={[4, 0, 0, 4]} maxBarSize={16} fill={p.crit}>
          <LabelList dataKey="gap" position="left" formatter={(v) => v.toFixed(0)}
            style={{ fill: p.muted, fontSize: 10, fontFamily: "var(--mono)" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MiniBars({ items, suffix = "%" }) {
  const p = palette();
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, items.length * 34)}>
      <BarChart data={items} layout="vertical" margin={{ top: 2, right: 40, left: 4, bottom: 2 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tick={{ fill: p.ink, fontSize: 12 }} width={110}
          tickLine={false} axisLine={false} />
        <Bar dataKey="v" radius={[0, 4, 4, 0]} maxBarSize={22} fill={p.accent}>
          <LabelList dataKey="v" position="right" formatter={(v) => v + suffix}
            style={{ fill: p.muted, fontSize: 11, fontFamily: "var(--mono)" }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
