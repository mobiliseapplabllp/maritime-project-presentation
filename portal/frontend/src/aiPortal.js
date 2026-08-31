/* Sagar Drishti — the AI analytics portal that runs alongside this one.
 *
 * It is a separate application (FastAPI + React on its own port), not a route
 * in this SPA, so it is reached by URL rather than by router navigation. The
 * address is build-time configurable: set VITE_AI_PORTAL_URL when hosting the
 * pair behind a domain (e.g. https://sagar.example.in).
 */
const DEFAULT_URL = 'http://localhost:5273';

export const AI_PORTAL = {
  name: 'Sagar Drishti',
  short: 'Sagar AI',
  desc: 'AI analytics — findings, natural-language reports, document Q&A and the 3D port twin',
  color: '#0E7C86',
  url: String(import.meta.env.VITE_AI_PORTAL_URL || DEFAULT_URL).replace(/\/+$/, ''),
};

/* The shareable demo bundle runs in a viewer's browser with no local backend,
 * so a localhost link would be dead there. Callers show an explainer instead. */
export const IS_DEMO = import.meta.env.VITE_DEMO === '1';

/* True when the configured address is a loopback one — it will only resolve on
 * the machine running the portal, which is worth saying out loud in the UI. */
export const AI_PORTAL_IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(AI_PORTAL.url);

export function openAiPortal() {
  window.open(AI_PORTAL.url, '_blank', 'noopener,noreferrer');
}
