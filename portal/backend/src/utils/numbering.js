// Sequential business numbers per year, derived from the max existing number.
async function nextNumber(Model, field, prefix, pad = 4) {
  const rx = new RegExp('^' + prefix.replace(/[/\-]/g, '\\$&'));
  const last = await Model.findOne({ [field]: { $regex: rx.source } }).sort({ [field]: -1 }).select(field).lean();
  let n = 1;
  if (last) {
    const m = String(last[field]).match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(n).padStart(pad, '0')}`;
}
module.exports = { nextNumber };
