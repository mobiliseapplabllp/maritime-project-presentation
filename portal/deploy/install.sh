#!/usr/bin/env bash
# One-command deployment for the Mundra Port Operations Portal.
#
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
MODE="${MODE:-demo}"     # demo = seeded Mundra dataset · prod = empty database
TLS="${TLS:-auto}"       # auto | letsencrypt | selfsigned | existing

say()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (sudo $0)"
[ -n "$DOMAIN" ] || die "Set DOMAIN=your.domain.name"

# ── 1 · Docker ───────────────────────────────────────────────────────────
say "Checking Docker"
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker not found — installing"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 plugin is missing"
ok "$(docker --version)"

# ── 2 · source ───────────────────────────────────────────────────────────
say "Fetching the application"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH" --quiet
  git -C "$APP_DIR" checkout "$BRANCH" --quiet
  git -C "$APP_DIR" reset --hard "origin/$BRANCH" --quiet
  ok "Updated $APP_DIR to $(git -C "$APP_DIR" rev-parse --short HEAD)"
else
  mkdir -p "$(dirname "$APP_DIR")"
  git clone -b "$BRANCH" --quiet "$REPO" "$APP_DIR"
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
