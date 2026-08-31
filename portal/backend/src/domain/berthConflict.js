// Half-open windows: [start, end). Touching edges (one sails as the next berths) is not a conflict.
function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

// activeCalls: [{_id, vcn, berth, atb|etb, etd}] currently holding or booked on berths.
function findBerthConflict(activeCalls, berthId, from, to, excludeId) {
  for (const c of activeCalls) {
    if (String(c._id) === String(excludeId)) continue;
    if (String(c.berth) !== String(berthId)) continue;
    const start = c.atb || c.etb;
    const end = c.etd || new Date(8640000000000000); // open-ended occupation blocks everything
    if (start && overlaps(new Date(start), new Date(end), from, to)) return c;
  }
  return null;
}

module.exports = { overlaps, findBerthConflict };
