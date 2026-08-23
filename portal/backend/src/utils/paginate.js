const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseQuery(query, { defaultSort = '-createdAt', maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || 20));
  const sort = query.sort || defaultSort;
  return { page, limit, skip: (page - 1) * limit, sort };
}

function searchFilter(q, fields) {
  if (!q || !fields.length) return null;
  const rx = { $regex: escapeRegex(q.trim()), $options: 'i' };
  return fields.length === 1 ? { [fields[0]]: rx } : { $or: fields.map((f) => ({ [f]: rx })) };
}

module.exports = { parseQuery, searchFilter, escapeRegex };
