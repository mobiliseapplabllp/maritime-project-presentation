const TOKEN_KEY = "sagar_token";

function uiLang() {
  const v = localStorage.getItem("sagar_lang") || "en";
  return ["en", "hi", "gu"].includes(v) ? v : "en";   // en | hi | gu only
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function req(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  // Carry the UI language on every request so AI-generated text (cards,
  // reasoning, briefs) comes back in the selected language. Endpoints that
  // don't read `lang` simply ignore the extra query param.
  const lang = uiLang();
  if (lang !== "en" && !/[?&]lang=/.test(path)) {
    path += (path.includes("?") ? "&" : "?") + `lang=${lang}`;
  }
  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event("sagar-logout"));
    throw new Error("Session expired — please sign in again.");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch (e) {}
    throw new Error(detail);
  }
  return res.json();
}

export const api = {
  login: async (username, password) => {
    const body = new URLSearchParams({ username, password });
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      let d = "Invalid username or password";
      try {
        const j = await res.json();
        d = typeof j.detail === "string" ? j.detail : d;
      } catch (e) {}
      throw new Error(d);
    }
    return res.json();
  },
  otpRequest: (email) => fetch("/api/auth/otp/request", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).then((r) => r.json()),
  otpVerify: async (email, code) => {
    const r = await fetch("/api/auth/otp/verify", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code }) });
    if (!r.ok) { let d = "Invalid or expired code"; try { d = (await r.json()).detail || d; } catch (e) {} throw new Error(d); }
    return r.json();
  },
  del: (p) => req(p, { method: "DELETE" }),
  post: (p, body) => req(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }),
  patch: (p, body) => req(p, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }),
  put: (p, body) => req(p, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }),
  me: () => req("/auth/me"),
  health: () => req("/health"),
  get: (p) => req(p),
  chat: (message, history, mode = "concise", extra = {}) =>
    req("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history, mode, lang: uiLang(), ...extra }),
    }),
  agents: () => req("/agents"),
  lastCycle: () => req("/agents/cycle/last"),
  runAgents: () => req("/agents/run", { method: "POST" }),
  runStatus: (id) => req(`/agents/run/${id}`),
  explain: (payload) =>
    req("/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, lang: uiLang() }),
    }),
  // port unit endpoints (scoped)
  units: () => req("/units"),
  unit: (id) => req(`/units/${encodeURIComponent(id)}`),
  unitAnalysis: (id) =>
    req(`/units/${encodeURIComponent(id)}/analysis?lang=${uiLang()}`),
  region: () => req("/region"),
  compliance: () => req("/compliance"),
  maintenance: () => req("/maintenance"),
  hotspots: () => req("/hotspots"),
  predictions: () => req("/predictions"),
  // back-compat alias used by older pages
  unitAnalysisByName: (name) =>
    req(`/units/${encodeURIComponent(name)}/analysis?lang=${uiLang()}`),
  workorders: ({ status = "", terminal = "" } = {}) =>
    req(`/workorders?status=${encodeURIComponent(status)}&terminal=${encodeURIComponent(terminal)}`),
  woRoles: () => req("/workorders/roles"),
  woCreate: (payload) =>
    req("/workorders", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload) }),
  woGenerate: () => req("/workorders/generate", { method: "POST" }),
  woPatch: (id, patch) =>
    req(`/workorders/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch) }),
  ttsStatus: () => req("/tts/status"),
  ttsBlob: async (text, lang, gender) => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ text, lang, gender }),
    });
    if (!res.ok) throw new Error("neural tts failed");
    return res.blob();
  },
  dataCatalog: () => req("/data/catalog"),
  dataPreview: (id, { offset = 0, limit = 50, q = "" } = {}) =>
    req(`/data/${id}?offset=${offset}&limit=${limit}&q=${encodeURIComponent(q)}`),
  agentConfig: () => req("/agents/config"),
  saveAgentConfig: (patch) =>
    req("/agents/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
};
