#!/usr/bin/env bash
# Change a portal account's password from the command line. No dependencies
# beyond curl. Nothing is passed as an argument or echoed, so no password
# reaches your shell history or the process list.
#
#   ./change-admin-password.sh https://apdev.onmobilise.co.in
#
# The seeded administrator password is published in the repository, so this is
# the first thing to run on a host anyone else can reach.
set -uo pipefail

BASE="${1:-https://localhost}"
API="$BASE/api"

red()  { printf '\033[31m%s\033[0m\n' "$1"; }
grn()  { printf '\033[32m%s\033[0m\n' "$1"; }
die()  { red "  ✗ $1"; exit 1; }

# -k because a self-signed certificate is the expected state until the name has
# public DNS. The request never leaves the host it is aimed at.
req() { curl -sk --max-time 20 -H 'Content-Type: application/json' "$@"; }
jget() { sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" <<<"$1" | head -1; }

printf '\n\033[1;36m==>\033[0m Change password — %s\n\n' "$BASE"

read -r -p "  account email [admin@mundraport.in]: " EMAIL
EMAIL="${EMAIL:-admin@mundraport.in}"
read -r -s -p "  current password: " OLD; echo
read -r -s -p "  new password: "     NEW; echo
read -r -s -p "  new password again: " NEW2; echo
echo

[ -n "$OLD" ] || die "current password cannot be empty"
[ "$NEW" = "$NEW2" ] || die "the two new passwords do not match"
[ "$NEW" != "$OLD" ] || die "the new password is the same as the current one"
[ "${#NEW}" -ge 12 ] || die "use at least 12 characters — the server floor is 8, but this host is reachable"

# A JSON string cannot carry a raw backslash or quote. Escape both rather than
# letting a perfectly good password produce a confusing 400.
esc() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

LOGIN=$(req -X POST "$API/auth/login" \
  -d "{\"email\":\"$(esc "$EMAIL")\",\"password\":\"$(esc "$OLD")\"}")
TOKEN=$(jget "$LOGIN" token)
[ -n "$TOKEN" ] || die "sign-in failed — check the email and current password"
grn "  ✓ signed in as $EMAIL"

RES=$(req -X POST "$API/auth/change-password" -H "Authorization: Bearer $TOKEN" \
  -d "{\"currentPassword\":\"$(esc "$OLD")\",\"newPassword\":\"$(esc "$NEW")\"}")
if ! grep -q '"changed"[[:space:]]*:[[:space:]]*true' <<<"$RES"; then
  die "server refused the change: $(jget "$RES" message)"
fi
grn "  ✓ password changed"

# Prove it, rather than assume it. A change that silently did not apply is
# worse than one that failed loudly.
VERIFY=$(req -X POST "$API/auth/login" \
  -d "{\"email\":\"$(esc "$EMAIL")\",\"password\":\"$(esc "$NEW")\"}")
[ -n "$(jget "$VERIFY" token)" ] || die "the new password does not sign in — investigate before logging out"
grn "  ✓ the new password signs in"

OLDCHECK=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 -X POST "$API/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$(esc "$EMAIL")\",\"password\":\"$(esc "$OLD")\"}")
[ "$OLDCHECK" = 401 ] && grn "  ✓ the old password is refused" \
                      || red "  ! the old password returned $OLDCHECK, expected 401"

printf '\n  Done. The change is in the audit log as PASSWORD_CHANGE.\n\n'
