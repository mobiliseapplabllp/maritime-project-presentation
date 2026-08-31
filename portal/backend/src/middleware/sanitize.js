// Request sanitisation — closes the NoSQL-operator injection route.
// Query strings parsed with qs turn ?field[$ne]=x into objects; anything the
// portal legitimately sends is a plain scalar, so object/array-valued query
// params are flattened or dropped. Bodies are deep-cleaned of keys that could
// smuggle Mongo operators ($-prefixed) or path traversal into updates.

const cleanBody = (v) => {
  if (Array.isArray(v)) return v.map(cleanBody);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      out[k] = cleanBody(val);
    }
    return out;
  }
  return v;
};

function sanitizeRequest(req, _res, next) {
  if (req.body && typeof req.body === 'object') req.body = cleanBody(req.body);
  if (req.query && typeof req.query === 'object') {
    for (const [k, v] of Object.entries(req.query)) {
      if (Array.isArray(v)) req.query[k] = v.length ? String(v[0]) : '';
      else if (v && typeof v === 'object') delete req.query[k];
      else if (v !== undefined) req.query[k] = String(v);
    }
  }
  next();
}

module.exports = { sanitizeRequest };
