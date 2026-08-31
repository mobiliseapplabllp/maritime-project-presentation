#!/usr/bin/env bash
#
# deploy-local.sh — stand up the whole maritime stack on this machine.
#
#   ./deploy-local.sh              deploy the platform (API + web portal + MongoDB,
#                                  auto-seeded) and print how to launch the apps
#   ./deploy-local.sh --web        also start the React prototype (foreground)
#   ./deploy-local.sh --flutter    also run the Flutter app on the iOS simulator
#   ./deploy-local.sh reset        wipe the demo data and re-seed a clean world
#   ./deploy-local.sh stop         stop the platform containers
#
# The platform is the source of truth for both mobile apps; bring it up first.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API="http://localhost:5200/api"
SIM_UDID="${SIM_UDID:-4A59CFC2-CAA4-42C5-89A2-E1611B756920}"  # override for another simulator
XCODE_DEV="/Applications/Xcode.app/Contents/Developer"

c()   { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
info() { c '36' "→ $1"; }
ok()   { c '32' "✓ $1"; }
warn() { c '33' "! $1"; }
die()  { c '31' "✗ $1"; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required but not installed. $2"; }

# ── make sure the Docker daemon is up (start Docker Desktop if it is not) ────
ensure_docker() {
  need docker "Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  if docker info >/dev/null 2>&1; then return; fi
  if [ -d "/Applications/Docker.app" ]; then
    info "Docker daemon is not running — starting Docker Desktop…"
    open -a Docker
    for i in $(seq 1 60); do
      docker info >/dev/null 2>&1 && { ok "Docker daemon ready"; return; }
      sleep 2
    done
    die "Docker Desktop did not finish starting — open it manually and re-run."
  fi
  die "Docker daemon is not running. Start Docker Desktop and re-run."
}

wait_healthy() {
  info "Waiting for the API to come up and seed…"
  for i in $(seq 1 90); do
    if curl -fs "$API/health" >/dev/null 2>&1 \
       && curl -fs -X POST "$API/auth/login" -H 'Content-Type: application/json' \
            -d '{"email":"admin@maritime.example","password":"Demo@2026"}' >/dev/null 2>&1; then
      ok "API healthy and seeded at http://localhost:5200"; return
    fi
    [ "$i" = 90 ] && die "API did not become healthy/seeded in time — check: (cd portal && docker compose logs -f portal)"
    sleep 2
  done
}

# ── platform: docker compose (mongo + API + web portal, seeds on first run) ──
deploy_platform() {
  ensure_docker
  info "Building and starting the platform (this can take a few minutes the first time)…"
  ( cd "$ROOT/portal" && docker compose up --build -d )
  wait_healthy
}

# ── grant the customer pay permission (seed does not include it) ─────────────
grant_pay() {
  need python3 "Install Python 3."
  info "Granting invoices.pay to the Shipping Agent role (for the customer pay flow)…"
  local token rid
  token=$(curl -fs -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d '{"email":"admin@maritime.example","password":"Demo@2026"}' \
    | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["token"])') \
    || die "admin login failed — is the platform seeded yet?"
  rid=$(curl -fs "$API/roles" -H "Authorization: Bearer $token" \
    | python3 -c 'import json,sys;print(next(r["_id"] for r in json.load(sys.stdin)["data"] if r["name"]=="Shipping Agent"))')
  curl -fs -X PUT "$API/roles/$rid" -H "Authorization: Bearer $token" -H 'Content-Type: application/json' \
    -d '{"name":"Shipping Agent","permissions":["dashboard.view","vessels.view","portcalls.view","portcalls.create","invoices.view","invoices.pay","legislation.view","ai.use","registry.view","registry.apply","services.view","services.apply"]}' \
    >/dev/null && ok "invoices.pay granted"
}

next_steps() {
  echo
  c '1' "Platform is up:"
  echo "  • Web portal + API   http://localhost:5200   (sign in: admin@maritime.example / Demo@2026)"
  echo
  c '1' "Run the mobile apps (each in its own terminal):"
  echo "  • React prototype    ./deploy-local.sh --web        → http://localhost:5174"
  echo "  • Flutter app        ./deploy-local.sh --flutter    → iOS simulator"
  echo
  echo "  Seeded logins (all password Demo@2026):"
  echo "    Authority  surveyor@maritime.example · harbour@… · nmc@… · admin@…"
  echo "    Customer   agent@maritime.example · finance@maritime.example"
  echo
  echo "  Reset the demo data:  ./deploy-local.sh reset"
  echo "  Stop the platform:    ./deploy-local.sh stop"
}

run_web() {
  need npm "Install Node.js: https://nodejs.org/"
  info "Starting the React prototype on http://localhost:5174 (Ctrl+C to stop)…"
  ( cd "$ROOT/mobile-app" && npm install && npm run dev )
}

run_flutter() {
  need flutter "Install Flutter: https://docs.flutter.dev/get-started/install/macos"
  [ -d "$XCODE_DEV" ] || die "Full Xcode not found at $XCODE_DEV (install it from the App Store)."
  info "Launching the Flutter app on simulator $SIM_UDID (Ctrl+C to stop)…"
  export DEVELOPER_DIR="$XCODE_DEV"
  ( cd "$ROOT/mobile-flutter" && flutter pub get && flutter run -d "$SIM_UDID" )
}

reset_data() {
  ensure_docker
  warn "Rebuilding from current source, wiping the demo database, and re-seeding…"
  # --build so the image picks up current backend code (and the current seed);
  # -v so the old volume is discarded and SEED_IF_EMPTY re-seeds a fresh world.
  ( cd "$ROOT/portal" && docker compose down -v && docker compose up --build -d )
  wait_healthy
  grant_pay
  ok "Clean demo world seeded."
}

stop_platform() {
  need docker "Install Docker Desktop."
  ( cd "$ROOT/portal" && docker compose stop )
  ok "Platform stopped (data preserved). Start again with ./deploy-local.sh"
}

case "${1:-deploy}" in
  deploy)   deploy_platform; grant_pay; next_steps ;;
  --web)    run_web ;;
  --flutter) run_flutter ;;
  reset)    reset_data; next_steps ;;
  stop)     stop_platform ;;
  *)        die "Unknown command '$1'. Use: deploy | --web | --flutter | reset | stop" ;;
esac
