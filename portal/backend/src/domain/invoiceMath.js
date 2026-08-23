// All money handled in paise (integer) internally; rupees with 2dp at the boundary.
const toPaise = (n) => Math.round(n * 100);
const toRupees = (p) => p / 100;
const round2 = (n) => Math.round(n * 100) / 100;

function computeTotals(rawLines, gstRatePct) {
  const lines = rawLines.map((l) => ({ ...l, amount: round2((l.qty || 0) * (l.rate || 0)) }));
  const subtotalP = lines.reduce((s, l) => s + toPaise(l.amount), 0);
  const gstP = Math.round((subtotalP * gstRatePct) / 100);
  return {
    lines,
    subtotal: toRupees(subtotalP),
    gstAmount: toRupees(gstP),
    total: toRupees(subtotalP + gstP),
  };
}

// Derives draft invoice lines from a port call: GRT-based port dues, chargeable
// services, wharfage from cargo operations. tariffs = { CODE: {code,name,unit,rate} }.
const LIQUID_CARGO = /CRUDE|POL|EDIBLE|LNG|LPG|CHEMICAL/i;

function wharfageCode(cargoOp) {
  if (cargoOp.unit === 'TEU') return 'WFC';
  if (cargoOp.unit === 'UNITS') return 'WFR';
  return LIQUID_CARGO.test(String(cargoOp.cargoType)) ? 'WFL' : 'WFB';
}

function buildInvoiceLines(call, tariffs) {
  const lines = [];
  const push = (t, qty, descSuffix) => {
    if (!t || !qty) return;
    lines.push({
      code: t.code,
      description: descSuffix ? `${t.name} — ${descSuffix}` : t.name,
      unit: t.unit, qty, rate: t.rate,
      amount: round2(qty * t.rate),
    });
  };
  const grt = call.vessel && call.vessel.grt;
  if (grt) push(tariffs.PD, grt);
  for (const s of call.services || []) {
    push(s.tariffCode && tariffs[s.tariffCode], s.qty || 1, s.description);
  }
  for (const c of call.cargoOps || []) {
    push(tariffs[wharfageCode(c)], c.qty, c.cargoType);
  }
  return lines;
}

module.exports = { computeTotals, buildInvoiceLines, round2 };
