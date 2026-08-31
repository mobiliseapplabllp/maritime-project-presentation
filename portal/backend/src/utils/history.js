/* Shared helpers for the history/utilisation readings computed off the
 * embedded arrays the masters carry (craft jobs, berth outages, tariff
 * revisions). Kept in plain JS so FerretDB never sees an aggregation. */
const DAY = 24 * 3600 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const monthKey = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key) => `${MONTHS[Number(String(key).slice(5, 7)) - 1]} ${String(key).slice(2, 4)}`;

// Clamp a ?months= query to something sane.
const clampMonths = (v, dflt = 12, max = 48) => Math.min(max, Math.max(1, parseInt(v, 10) || dflt));

/**
 * The last `n` calendar months ending with the current one, oldest first.
 * Returns the bucket list (with its own [from,to) bounds) plus the overall window.
 */
function monthWindow(n, now = new Date()) {
  const bounds = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    bounds.push({ key: monthKey(from), label: monthLabel(monthKey(from)), from, to });
  }
  return { bounds, keys: bounds.map((b) => b.key), from: bounds[0].from, to: bounds[bounds.length - 1].to };
}

// Days of [from,to) that fall inside [winFrom,winTo).
function overlapDays(from, to, winFrom, winTo) {
  if (!from || !to) return 0;
  const a = Math.max(new Date(from).getTime(), new Date(winFrom).getTime());
  const b = Math.min(new Date(to).getTime(), new Date(winTo).getTime());
  return b > a ? (b - a) / DAY : 0;
}

/** Share of a window not spent out of service, from a list of {from,to} windows. */
function availability(outages, from, to) {
  const span = (new Date(to) - new Date(from)) / DAY;
  const days = (outages || []).reduce((s, o) => s + overlapDays(o.from, o.to, from, to), 0);
  return { days: round1(days), availabilityPct: span > 0 ? round1(Math.max(0, 100 - (days / span) * 100)) : 100 };
}

module.exports = { DAY, round1, monthKey, monthWindow, overlapDays, availability, clampMonths };
