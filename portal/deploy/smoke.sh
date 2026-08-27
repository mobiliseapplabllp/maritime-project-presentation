#!/usr/bin/env bash
# End-to-end check against a deployed portal. No dependencies beyond curl.
#
#   ./smoke.sh https://apdev.onmobilise.co.in
#   ./smoke.sh https://127.0.0.1 apdev.onmobilise.co.in   # before DNS points here
#
# Exercises the real request path: TLS, authentication, RBAC, the ship register,
# and public certificate verification. Exits non-zero if anything is wrong.
set -uo pipefail

BASE="${1:-https://localhost}"
HOSTHDR="${2:-}"
USER_EMAIL="${SMOKE_USER:-admin@mundraport.in}"
USER_PASS="${SMOKE_PASS:-Mundra@2026}"

PASS=0; FAIL=0
H=(); [ -n "$HOSTHDR" ] && H=(-H "Host: $HOSTHDR")
req() { curl -sk --max-time 20 "${H[@]}" "$@"; }
code() { curl -sk --max-time 20 -o /dev/null -w '%{http_code}' "${H[@]}" "$@"; }

pass() { printf '  \033[32m✓\033[0m %-46s %s\n' "$1" "${2:-}"; PASS=$((PASS+1)); }
fail() { printf '  \033[31m✗\033[0m %-46s %s\n' "$1" "${2:-}"; FAIL=$((FAIL+1)); }
chk()  { if [ "$2" = "$3" ]; then pass "$1" "$3"; else fail "$1" "expected $3, got $2"; fi; }

# crude but dependency-free JSON field read
jget() { sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",}]*\).*/\1/p" <<<"$1" | head -1; }

printf '\n\033[1;36m==>\033[0m End-to-end check — %s%s\n\n' "$BASE" "${HOSTHDR:+ (Host: $HOSTHDR)}"

# ── reachability and TLS ─────────────────────────────────────────────────
chk "health endpoint answers" "$(code "$BASE/api/health")" "200"

if [[ "$BASE" == https://* ]]; then
  TLS=$(curl -s -o /dev/null -w '%{ssl_verify_result}' --max-time 20 "${H[@]}" "$BASE/api/health" 2>/dev/null)
  CA_FILE="$(dirname "$0")/certs/internal-ca.crt"
  if [ "$TLS" = 0 ]; then
    pass "TLS certificate trusted by this host"
  elif [ -s "$CA_FILE" ] && curl -s -o /dev/null --cacert "$CA_FILE" --max-time 20 \
       "${H[@]}" "$BASE/api/health" 2>/dev/null; then
    # Not in the system trust store, but it does verify against the internal CA
    # root this deployment issued from — which is the expected state until that
    # root is installed on the machine doing the browsing.
    pass "TLS verifies against the internal CA" "install internal-ca.crt to clear the browser warning"
  else
    printf '  \033[33m!\033[0m %-46s %s\n' "TLS certificate not trusted" "verify_result=$TLS (self-signed?)"
  fi
fi

REDIR=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "${H[@]}" "${BASE/https:/http:}/api/health" 2>/dev/null)
[ "$REDIR" = 301 ] || [ "$REDIR" = 302 ] && pass "HTTP redirects to HTTPS" "$REDIR" || \
  printf '  \033[33m!\033[0m %-46s %s\n' "HTTP → HTTPS redirect" "got $REDIR"

# ── authentication ───────────────────────────────────────────────────────
LOGIN=$(req -X POST "$BASE/api/auth/login" -H 'content-type: application/json' \
  -d "{\"email\":\"$USER_EMAIL\",\"password\":\"$USER_PASS\"}")
TOKEN=$(jget "$LOGIN" token)
if [ -n "$TOKEN" ] && [ ${#TOKEN} -gt 40 ]; then
  pass "sign in as $USER_EMAIL" "token ${#TOKEN} chars"
else
  fail "sign in as $USER_EMAIL" "no token — $(head -c 120 <<<"$LOGIN")"
  printf '\n\033[1;31mCannot continue without a session.\033[0m\n'; exit 1
fi
A=(-H "authorization: Bearer $TOKEN")

chk "unauthenticated request is refused" "$(code "$BASE/api/vessels")" "401"
chk "bad password is refused" \
  "$(code -X POST "$BASE/api/auth/login" -H 'content-type: application/json' -d '{"email":"admin@mundraport.in","password":"wrong"}')" "401"

# ── the data actually loaded ─────────────────────────────────────────────
for ep in dashboard vessels port-calls invoices inspections incidents seafarers licenses registrations; do
  chk "GET /api/$ep" "$(code "${A[@]}" "$BASE/api/$ep?limit=1")" "200"
done

COUNT=$(req "${A[@]}" "$BASE/api/vessels?limit=1" | sed -n 's/.*"total"[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' | head -1)
[ "${COUNT:-0}" -gt 0 ] && pass "fleet is populated" "$COUNT vessels" || fail "fleet is populated" "0 vessels — was it seeded?"

REG=$(req "${A[@]}" "$BASE/api/registrations/dashboard")
ON_REG=$(jget "$REG" registered)
[ -n "$ON_REG" ] && pass "ship register populated" "$ON_REG ships registered" \
                 || fail "ship register populated" "no figure returned"

# ── the feature worth demonstrating ──────────────────────────────────────
KEY=$(req "$BASE/api/public/signing-key")
KEYID=$(jget "$KEY" keyId)
[ -n "$KEYID" ] && pass "public signing key published" "keyId $KEYID" \
                || fail "public signing key published" "not served"

CERT=$(req "${A[@]}" "$BASE/api/licenses?limit=1&instrumentClass=CERTIFICATE&status=ISSUED")
CERTNO=$(jget "$CERT" licenseNo)
if [ -n "$CERTNO" ]; then
  VER=$(req "$BASE/api/public/verify/$CERTNO")
  if grep -q '"valid":true' <<<"$VER"; then
    pass "certificate verifies publicly" "$CERTNO"
  else
    fail "certificate verifies publicly" "$CERTNO — $(jget "$VER" reason)"
  fi
  grep -q '"signed":true' <<<"$VER" && pass "certificate is digitally signed" \
                                    || fail "certificate is digitally signed" "unsigned"
else
  fail "found an issued certificate to verify" "none returned"
fi

OFFNO=$(req "${A[@]}" "$BASE/api/registrations?limit=20&status=GRANTED" | \
  sed -n 's/.*"officialNumber"[[:space:]]*:[[:space:]]*"\([0-9][0-9]*\)".*/\1/p' | head -1)
if [ -n "$OFFNO" ]; then
  grep -q '"found":true' <<<"$(req "$BASE/api/public/registry/$OFFNO")" \
    && pass "public registry lookup" "official number $OFFNO" \
    || fail "public registry lookup" "$OFFNO not found"
fi

chk "API reference page served" "$(code "$BASE/api/docs")" "200"
chk "single-page app served" "$(code "$BASE/")" "200"

printf '\n────────────────────────────────────────────\n'
if [ "$FAIL" -eq 0 ]; then
  printf '\033[1;32m  %d checks passed. The deployment is working.\033[0m\n\n' "$PASS"; exit 0
else
  printf '\033[1;31m  %d passed, %d FAILED.\033[0m\n\n' "$PASS" "$FAIL"; exit 1
fi
