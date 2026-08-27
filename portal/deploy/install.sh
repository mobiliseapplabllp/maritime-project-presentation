#!/usr/bin/env bash
# One-command deployment for the Mundra Port Operations Portal.
#
#   sudo GH_TOKEN=... DOMAIN=apdev.example.com ./install.sh check   ← inspect only
#   sudo MODE=demo DOMAIN=apdev.example.com EMAIL=ops@example.com ./install.sh
#
# Brings up the portal, MongoDB and an nginx TLS edge on one host. Safe to run
# again: secrets, certificates and data are never overwritten on a second run.
set -euo pipefail

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
APP_DIR="${APP_DIR:-/opt/portal}"
REPO="${REPO:-https://github.com/mobiliseapplabllp/maritime-project-presentation.git}"
BRANCH="${BRANCH:-claude/maritime-project-presentation-g9sphj}"
MODE="${MODE:-demo}"             # demo = seeded Mundra dataset · prod = empty database
TLS="${TLS:-auto}"               # auto | letsencrypt | selfsigned | existing
INSTALL_DOCKER="${INSTALL_DOCKER:-no}"   # yes = allow this script to install Docker
GH_TOKEN="${GH_TOKEN:-}"         # required — this is a private repository
CHECK_ONLY="${CHECK_ONLY:-no}"   # yes = report readiness and change nothing

say()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$*"; }
bad()  { printf '    \033[31m✗\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "${1:-}" = "check" ] && CHECK_ONLY=yes || true
[ "$(id -u)" -eq 0 ] || die "Run as root (sudo $0)"
[ -n "$DOMAIN" ] || die "Set DOMAIN=your.domain.name"

# The repository is private. Authenticate with a header rather than a token in
# the remote URL, so nothing secret is left behind in .git/config for the next
# person who reads it.
GIT_AUTH=()
[ -n "$GH_TOKEN" ] && GIT_AUTH=(-c "http.extraHeader=Authorization: Bearer $GH_TOKEN")
git_auth() { git "${GIT_AUTH[@]}" "$@"; }

# ── 1 · preflight ────────────────────────────────────────────────────────
# Everything is inspected and reported before anything is changed. On a server
# that already runs other things, finding out about a port clash halfway
# through a deployment is worse than not starting.
BLOCKERS=0
block() { bad "$*"; BLOCKERS=$((BLOCKERS + 1)); }

OS_NAME=$( (. /etc/os-release 2>/dev/null && printf '%s' "$PRETTY_NAME") || uname -s )
say "Preflight — $(hostname), ${OS_NAME:-unknown}"

# -- Docker
if command -v docker >/dev/null 2>&1; then
  ok "docker present — $(docker --version 2>/dev/null | cut -d, -f1 || echo installed)"
  if docker info >/dev/null 2>&1; then
    ok "docker daemon responding"
  elif systemctl list-unit-files docker.service >/dev/null 2>&1; then
    warn "docker installed but the daemon is not running — will start it"
    NEED_DOCKER_START=yes
  else
    block "docker installed but the daemon is not responding, and there is no docker.service"
  fi
  if docker compose version >/dev/null 2>&1; then
    ok "compose v2 — $(docker compose version --short 2>/dev/null || echo present)"
  else
    block "docker compose v2 plugin missing (install docker-compose-plugin)"
  fi
else
  if [ "$INSTALL_DOCKER" = yes ]; then
    warn "docker not installed — will install it (INSTALL_DOCKER=yes)"
    NEED_DOCKER_INSTALL=yes
  else
    block "docker is not installed. Install it with your platform's package manager,"
    bad  "  or re-run with INSTALL_DOCKER=yes to let this script fetch get.docker.com"
  fi
fi

# -- tools
for t in git openssl curl; do
  command -v "$t" >/dev/null 2>&1 && ok "$t present" || block "$t is not installed"
done

# -- ports. nginx wants both; anything already bound stops the deployment dead.
# ss is not on every minimal server, so fall back through netstat to a plain
# connect probe. None of these may fail the run.
port_holder() {
  local port="$1" out=""
  if command -v ss >/dev/null 2>&1; then
    out=$(ss -lntp 2>/dev/null | awk -v p=":$port\$" '$4 ~ p {print $NF; exit}' || true)
  elif command -v netstat >/dev/null 2>&1; then
    out=$(netstat -lntp 2>/dev/null | awk -v p=":$port\$" '$4 ~ p {print $NF; exit}' || true)
  fi
  if [ -z "$out" ] && timeout 2 bash -c "cat < /dev/null > /dev/tcp/127.0.0.1/$port" 2>/dev/null; then
    out="an unidentified process"
  fi
  printf '%s' "$out"
}
for port in 80 443; do
  HOLDER=$(port_holder "$port")
  if [ -n "$HOLDER" ]; then
    block "port $port is already in use by $HOLDER"
  else
    ok "port $port free"
  fi
done

# -- disk. Images, the database and 3.6 years of seeded history need room.
AVAIL_MB=$(df -Pm "$(dirname "$APP_DIR")" 2>/dev/null | awk 'NR==2{print $4}' || true)
if [ "${AVAIL_MB:-0}" -lt 5000 ]; then
  block "only ${AVAIL_MB}MB free on $(dirname "$APP_DIR") — 5GB or more recommended"
else
  ok "$((AVAIL_MB / 1024))GB free on $(dirname "$APP_DIR")"
fi

# -- outbound. A server behind a VPN often cannot reach Docker Hub or GitHub,
# and both are needed to build.
# Any HTTP status proves we got through; only a connection failure (000) means
# blocked. The registry root answers 404 when perfectly healthy, so probe /v2/.
for probe in "github.com|https://github.com/" "Docker Hub|https://registry-1.docker.io/v2/"; do
  NAME="${probe%%|*}"; URL="${probe#*|}"
  CODE=$(curl -sS -o /dev/null --max-time 12 -w '%{http_code}' "$URL" 2>/dev/null || true)
  if [ -n "$CODE" ] && [ "$CODE" != "000" ]; then
    ok "$NAME reachable (HTTP $CODE)"
  else
    block "cannot reach $NAME — the build needs it. Behind a proxy? export HTTPS_PROXY"
  fi
done

# -- DNS, and whether Let's Encrypt can possibly work
RESOLVED=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)
if [ -z "$RESOLVED" ]; then
  warn "$DOMAIN does not resolve here — a self-signed certificate will be used"
elif printf '%s' "$RESOLVED" | grep -qE '^(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'; then
  warn "$DOMAIN → $RESOLVED (private) — Let's Encrypt cannot validate this host"
  warn "  self-signed unless you supply a CA certificate in deploy/certs"
else
  ok "$DOMAIN → $RESOLVED (public) — Let's Encrypt can validate"
fi

# A copy placed here by hand (rsync, scp, a tarball) is perfectly valid source.
if [ -f "$APP_DIR/portal/docker-compose.prod.yml" ] && [ ! -d "$APP_DIR/.git" ]; then
  HAVE_LOCAL_SOURCE=yes
fi

# -- repository access. Private repo: without a token nothing else matters.
REPO_CODE=$(curl -sS -o /dev/null --max-time 15 -w '%{http_code}' \
  ${GH_TOKEN:+-H "Authorization: Bearer $GH_TOKEN"} \
  "https://api.github.com/repos/mobiliseapplabllp/maritime-project-presentation" 2>/dev/null || true)
if [ "${HAVE_LOCAL_SOURCE:-no}" = yes ]; then
  ok "source already present in $APP_DIR — GitHub not needed"
elif [ "$REPO_CODE" = 200 ]; then
  ok "repository readable$([ -n "$GH_TOKEN" ] && echo " (token accepted)")"
elif [ -z "$GH_TOKEN" ]; then
  block "this repository is private and no GH_TOKEN was given."
  bad  "  Either set GH_TOKEN=<token with Contents: read>,"
  bad  "  or copy the source to $APP_DIR yourself and re-run (rsync from your laptop)."
else
  case "$REPO_CODE" in
    401|403) block "GitHub rejected the token (HTTP $REPO_CODE) — it may be expired or lack access" ;;
    404) block "repository not visible to this token — it needs Contents: read on mobiliseapplabllp/maritime-project-presentation" ;;
    *)   block "cannot reach the GitHub API (HTTP ${REPO_CODE:-none})" ;;
  esac
fi

# -- existing install
if [ -d "$APP_DIR/.git" ]; then
  warn "$APP_DIR already holds a checkout — it will be updated, not replaced"
  [ -f "$APP_DIR/portal/.env.prod" ] && ok "existing .env.prod found — secrets preserved"
else
  ok "$APP_DIR is a clean target"
fi

echo
if [ "$BLOCKERS" -gt 0 ]; then
  die "$BLOCKERS blocker(s) above. Nothing has been changed. Fix them and re-run."
fi
ok "Preflight clear"

if [ "$CHECK_ONLY" = yes ]; then
  say "CHECK_ONLY — stopping here. Nothing was changed."
  exit 0
fi

# ── 1b · Docker, only now that preflight passed ──────────────────────────
if [ "${NEED_DOCKER_INSTALL:-no}" = yes ]; then
  say "Installing Docker"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
  docker compose version >/dev/null 2>&1 || die "compose v2 plugin still missing after install"
  ok "Docker installed"
elif [ "${NEED_DOCKER_START:-no}" = yes ]; then
  say "Starting Docker"
  systemctl enable --now docker
  docker info >/dev/null 2>&1 || die "docker daemon still not responding"
  ok "Docker running"
fi

# ── 2 · source ───────────────────────────────────────────────────────────
say "Fetching the application"
if [ "${HAVE_LOCAL_SOURCE:-no}" = yes ]; then
  ok "Using the copy already in $APP_DIR (not a git checkout — updates are yours to manage)"
elif [ -d "$APP_DIR/.git" ]; then
  git_auth -C "$APP_DIR" fetch origin "$BRANCH" --quiet
  git -C "$APP_DIR" checkout "$BRANCH" --quiet
  git -C "$APP_DIR" reset --hard "origin/$BRANCH" --quiet
  ok "Updated $APP_DIR to $(git -C "$APP_DIR" rev-parse --short HEAD)"
else
  mkdir -p "$(dirname "$APP_DIR")"
  git_auth clone -b "$BRANCH" --quiet "$REPO" "$APP_DIR"
  ok "Cloned to $APP_DIR"
fi
cd "$APP_DIR/portal"
mkdir -p deploy/certs deploy/certbot

# ── 3 · secrets ──────────────────────────────────────────────────────────
say "Secrets"
if [ -f .env.prod ]; then
  ok ".env.prod already exists — leaving it alone"
else
  cat > .env.prod <<ENV
JWT_SECRET=$(openssl rand -hex 48)
JWT_REFRESH_SECRET=$(openssl rand -hex 48)
CERT_SIGNING_SECRET=$(openssl rand -hex 48)
CORS_ORIGIN=
ANTHROPIC_API_KEY=
SEED_IF_EMPTY=$([ "$MODE" = demo ] && echo 1 || echo 0)
ENV
  chmod 600 .env.prod
  ok "Generated .env.prod (mode: $MODE)"
  warn "CERT_SIGNING_SECRET signs every certificate the registry issues."
  warn "Back .env.prod up now. Changing that value later invalidates them all."
fi

# ── 4 · TLS ──────────────────────────────────────────────────────────────
say "TLS certificate for $DOMAIN"
have_cert() { [ -s deploy/certs/fullchain.pem ] && [ -s deploy/certs/privkey.pem ]; }

issue_letsencrypt() {
  [ -n "$EMAIL" ] || die "Let's Encrypt needs EMAIL=you@example.com"
  docker run --rm -p 80:80 \
    -v "$PWD/deploy/letsencrypt:/etc/letsencrypt" \
    certbot/certbot certonly --standalone --non-interactive --agree-tos \
    -m "$EMAIL" -d "$DOMAIN"
  cp "deploy/letsencrypt/live/$DOMAIN/fullchain.pem" deploy/certs/
  cp "deploy/letsencrypt/live/$DOMAIN/privkey.pem"   deploy/certs/
}

make_selfsigned() {
  openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
    -keyout deploy/certs/privkey.pem -out deploy/certs/fullchain.pem \
    -subj "/CN=$DOMAIN/O=Mobilise App Lab/C=IN" \
    -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,IP:127.0.0.1$(
      ip -4 -o addr show scope global 2>/dev/null |
      awk '{split($4,a,"/"); printf ",IP:%s", a[1]}')" 2>/dev/null
  chmod 600 deploy/certs/privkey.pem
}

if have_cert && [ "$TLS" != letsencrypt ]; then
  ok "Certificate already present in deploy/certs — reusing it"
elif [ "$TLS" = selfsigned ]; then
  make_selfsigned; ok "Self-signed certificate created"
elif [ "$TLS" = letsencrypt ]; then
  issue_letsencrypt; ok "Let's Encrypt certificate issued"
else
  # auto: only try Let's Encrypt if the name resolves publicly. It cannot
  # validate a host that is reachable only inside a private network.
  PUBLIC_IP="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)"
  if [ -n "$PUBLIC_IP" ] && [ -n "$EMAIL" ] &&
     ! printf '%s' "$PUBLIC_IP" | grep -qE '^(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'; then
    if issue_letsencrypt; then ok "Let's Encrypt certificate issued"
    else warn "Let's Encrypt failed — falling back to self-signed"; make_selfsigned; fi
  else
    warn "$DOMAIN resolves to ${PUBLIC_IP:-nothing} — not publicly reachable"
    warn "Using a self-signed certificate. Replace deploy/certs/*.pem with a real"
    warn "pair from your CA, or re-run with TLS=letsencrypt once DNS is public."
    make_selfsigned
  fi
fi

# ── 5 · run ──────────────────────────────────────────────────────────────
say "Starting the stack"
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
ok "Containers up"

say "Waiting for the portal to answer"
for i in $(seq 1 90); do
  if docker compose -f docker-compose.prod.yml --env-file .env.prod \
       exec -T portal node -e \
       'require("http").get("http://127.0.0.1:5200/api/health",r=>process.exit(r.statusCode===200?0:1)).on("error",()=>process.exit(1))' \
       2>/dev/null; then ok "Portal healthy after ${i}s"; break; fi
  [ "$i" -eq 90 ] && die "Portal did not become healthy — docker compose logs portal"
  sleep 1
done

# ── 6 · data ─────────────────────────────────────────────────────────────
if [ "$MODE" = demo ]; then
  say "Demo dataset"
  USERS=$(docker compose -f docker-compose.prod.yml --env-file .env.prod \
    exec -T mongo mongosh --quiet mundra_portal --eval 'db.users.countDocuments()' 2>/dev/null | tr -dc '0-9')
  if [ "${USERS:-0}" -gt 0 ]; then
    ok "Database already holds $USERS users — not reseeding"
  else
    docker compose -f docker-compose.prod.yml --env-file .env.prod \
      exec -T portal node scripts/seed.js
    ok "Seeded the Mundra dataset"
  fi
fi

# ── 7 · backups and renewal ──────────────────────────────────────────────
say "Backups and certificate renewal"
mkdir -p /var/backups/portal
cat > /etc/cron.d/mundra-portal <<CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# nightly database dump, 14-day retention
0 2 * * * root cd $APP_DIR/portal && docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T mongo mongodump --archive --quiet | gzip > /var/backups/portal/mundra-\$(date +\%F).gz && find /var/backups/portal -name 'mundra-*.gz' -mtime +14 -delete
# monthly certificate renewal
0 3 1 * * root cd $APP_DIR/portal && docker run --rm -v "\$PWD/deploy/letsencrypt:/etc/letsencrypt" -v "\$PWD/deploy/certbot:/var/www/certbot" certbot/certbot renew --webroot -w /var/www/certbot --quiet && cp deploy/letsencrypt/live/$DOMAIN/*.pem deploy/certs/ 2>/dev/null && docker compose -f docker-compose.prod.yml --env-file .env.prod restart nginx
CRON
chmod 644 /etc/cron.d/mundra-portal
ok "Nightly dump to /var/backups/portal, monthly cert renewal"

# ── 8 · verify ───────────────────────────────────────────────────────────
say "Verifying from the outside"
CODE=$(curl -sk -o /dev/null -w '%{http_code}' "https://127.0.0.1/api/health" || echo 000)
[ "$CODE" = 200 ] && ok "https://127.0.0.1/api/health → 200" || warn "health check returned $CODE"

cat <<SUMMARY

────────────────────────────────────────────────────────────────
  Portal        https://$DOMAIN
  Mode          $MODE $([ "$MODE" = demo ] && echo '(seeded Mundra dataset)' || echo '(empty database)')
  Directory     $APP_DIR/portal
  Secrets       $APP_DIR/portal/.env.prod   ← back this up
  Certificates  $APP_DIR/portal/deploy/certs
  Backups       /var/backups/portal (nightly, 14 days)

  Sign in       admin@mundraport.in / Mundra@2026
                CHANGE THAT PASSWORD BEFORE ANYONE ELSE SEES THE HOST

  Logs          cd $APP_DIR/portal && docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f
  Restart       … restart
  Update        git pull && … up -d --build
────────────────────────────────────────────────────────────────
SUMMARY
