# Security — Mundra Port Operations Portal

Hardening inventory, OWASP Top 10 mapping, and the automated evidence behind it.
Verified by the security regression suite: `npm run test:security` (backend), part
of the 26-test set that gates every change.

## Hardening inventory

| Layer | Control |
|---|---|
| Transport | TLS termination + HSTS at nginx (production compose); HTTP→HTTPS redirect |
| Headers | helmet on every response: CSP (`default-src 'self'`, fonts allow-listed), `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, no `X-Powered-By` |
| Authentication | bcrypt (cost 10) password hashes; JWT access + refresh with **separate secrets**; refresh tokens carry `typ: refresh` and access tokens are refused as refresh tokens; timing-equalised login (dummy bcrypt compare on unknown accounts) |
| Session policy | Access-token lifetime follows the admin setting `sessionTimeoutMin`; refresh lifetime via env |
| Brute force | Per-identity login throttle (10 failures / 15 min → 429) **plus** per-IP rate limits: 30/5 min on `/auth/login` + `/auth/refresh`, 1500/5 min on the API |
| Authorisation | Deny-by-default RBAC — 21 permission groups checked by middleware on every route; user + role loaded fresh per request so matrix edits apply immediately |
| Injection | Request sanitiser strips `$`-prefixed / dotted keys from bodies and flattens object-valued query params (kills `?field[$ne]=…` NoSQL operator injection); every search term is regex-escaped before use |
| Input limits | JSON body capped at 2 MB; pagination capped at 100 rows; workflow transitions validated server-side against the allowed state machine |
| Secrets | SMTP password and AI API key stored server-side, returned masked (`••••…`), and masked values are never re-persisted; JWT secrets via env, rotated at deploy |
| Audit | Every create/update/delete/login/password change recorded with actor, ip, before/after (passwordHash stripped); retention window enforced daily from the admin setting `auditRetentionDays` |
| CORS | Same-origin by default (UI served by the API/nginx); `CORS_ORIGIN` narrows explicitly when split-hosted |
| Supply chain | `npm audit` clean at dependency install; lockfiles committed |

## OWASP Top 10 (2021) mapping

| # | Category | Status | How it is addressed |
|---|---|---|---|
| A01 | Broken Access Control | No open findings | RBAC middleware on every route, deny by default; object access via server-side queries only |
| A02 | Cryptographic Failures | No open findings | bcrypt hashes, TLS in production, secrets masked and env-scoped |
| A03 | Injection | No open findings | Request sanitiser (Mongo operators), regex escaping, Mongoose schema casting; no raw query construction |
| A04 | Insecure Design | No open findings | Controlled state machines for calls/licences/incidents; settings validated against typed section specs |
| A05 | Security Misconfiguration | No open findings | helmet defaults + explicit CSP; `x-powered-by` disabled; prod compose exposes only nginx |
| A06 | Vulnerable Components | No open findings | `npm audit`: 0 vulnerabilities at install; pinned lockfiles |
| A07 | Identification & Auth Failures | No open findings | Throttling + rate limits, timing-equal login, refresh `typ` check, session policy from settings |
| A08 | Software & Data Integrity | No open findings | Identical images promoted Dev→UAT→Prod; no dynamic code loading; audit trail on all writes |
| A09 | Logging & Monitoring Failures | No open findings | Full audit trail with retention policy; auth failures logged via throttle path |
| A10 | SSRF | No open findings | The API makes no user-directed outbound requests (the AI call targets a fixed vendor endpoint with a server-held key) |

**Current assessment result: 0 open vulnerabilities.**

## Automated evidence (`test/security.test.js`)

1. helmet CSP + hardening headers present on every response
2. Object-valued query params cannot smuggle Mongo operators
3. `$`-prefixed keys stripped from write bodies (top level and nested)
4. Access token refused as refresh token; genuine refresh accepted
5. Forged-secret and `alg:none` tokens rejected
6. 11th failed login for an identity throttled with 429
7. Password minimum length enforced from admin settings
8. Settings API masks SMTP/AI credentials

## Re-assessment checklist (before each release)

- `npm test && npm run test:api && npm run test:security` — all green
- `npm audit --omit=dev` — no high/critical
- Rotate `JWT_SECRET` / `JWT_REFRESH_SECRET` on production secrets change
- Confirm nginx TLS config (HSTS, protocols ≥ TLS 1.2) unchanged
