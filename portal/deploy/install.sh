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
TLS="${TLS:-auto}"               # auto | letsencrypt | internal-ca | selfsigned | existing
EDGE="${EDGE:-auto}"             # auto | nginx | apache | none
APP_PORT_SET="${APP_PORT:+yes}"  # pinned by the operator, or ours to choose?
APP_PORT="${APP_PORT:-5200}"     # loopback port when the host's web server fronts us
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

# -- edge. If the host already serves 80/443 we go behind it rather than
# fighting it: on a shared box, stopping Apache to free a port breaks whatever
# else it was serving.
detect_edge() {
  local h80 h443
  h80=$(port_holder 80); h443=$(port_holder 443)
  if printf '%s%s' "$h80" "$h443" | grep -qiE 'apache|httpd'; then echo apache
  elif printf '%s%s' "$h80" "$h443" | grep -qiE 'nginx|caddy'; then echo none
  elif [ -n "$h80$h443" ]; then echo none
  else echo nginx; fi
}

# -- ports.
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
# Is whatever holds this port our own portal container from an earlier run?
# Compose names the project after the directory, which is always "portal".
ours_on_port() {
  docker ps -q --filter "publish=$1" \
    --filter "label=com.docker.compose.project=portal" 2>/dev/null | head -1 || true
}

[ "$EDGE" = auto ] && EDGE=$(detect_edge)

if [ "$EDGE" = nginx ]; then
  for port in 80 443; do
    if [ -n "$(port_holder "$port")" ]; then
      block "port $port is in use — re-run with EDGE=apache or EDGE=none to sit behind it"
    else
      ok "port $port free"
    fi
  done
  ok "edge: bundled nginx container will terminate TLS"
else
  SUM=$(printf '%s %s' "$(port_holder 80)" "$(port_holder 443)" | tr -s ' ' | tr -d ' ' | cut -c1-52)
  if [ -n "$SUM" ]; then
    ok "edge: $EDGE — the host already serves 80/443 ($SUM…)"
  else
    ok "edge: $EDGE — chosen explicitly; ports 80/443 are free but left alone"
  fi
  ok "portal will bind 127.0.0.1:$APP_PORT only; nothing on the host is stopped"
  # A re-run has to land on the port the last run settled on. That port is
  # held by our own container from that run, so a plain "is it free?" walk
  # would shuffle the portal one place along on every reinstall.
  if [ "$APP_PORT_SET" != yes ]; then
    PREV_PORT=$(sed -n 's/^APP_PORT=\([0-9]\{1,5\}\).*/\1/p' \
      "$APP_DIR/portal/.env.prod" 2>/dev/null | head -1 || true)
    if [ -n "${PREV_PORT:-}" ] && [ "$PREV_PORT" != "$APP_PORT" ]; then
      APP_PORT="$PREV_PORT"
      ok "reusing application port $APP_PORT from the previous install"
    fi
  fi

  # The application port matters as much as 80 and 443. On a shared host 5200 is
  # just as likely to be taken, and a container that cannot bind fails at start
  # rather than at preflight, after the image has already been built.
  APP_HOLDER=$(port_holder "$APP_PORT")
  if [ -n "$APP_HOLDER" ] && [ -n "$(ours_on_port "$APP_PORT")" ]; then
    ok "application port $APP_PORT held by this portal — it will be replaced"
    APP_HOLDER=""
  fi
  if [ -z "$APP_HOLDER" ]; then
    ok "application port $APP_PORT free"
  elif [ "$APP_PORT_SET" = yes ]; then
    block "port $APP_PORT is in use by ${APP_HOLDER%%,*} — pick another with APP_PORT="
  else
    CHOSEN=""
    for cand in $(seq 5201 5260); do
      [ -z "$(port_holder "$cand")" ] && { CHOSEN=$cand; break; }
    done
    if [ -n "$CHOSEN" ]; then
      warn "port $APP_PORT is in use by ${APP_HOLDER%%,*}…"
      APP_PORT="$CHOSEN"
      ok "using port $APP_PORT instead"
    else
      block "port $APP_PORT is in use and nothing free between 5201 and 5260"
    fi
  fi
  if [ "$EDGE" = apache ]; then
    if command -v apache2ctl >/dev/null 2>&1 || command -v apachectl >/dev/null 2>&1; then
      ok "apache control binary found — a vhost for $DOMAIN will be written"
    else
      block "EDGE=apache but no apache2ctl/apachectl on PATH"
    fi
  else
    warn "EDGE=none — you will need to point your own web server at 127.0.0.1:$APP_PORT"
  fi
fi

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

COMPOSE_FILES=(-f docker-compose.prod.yml)
[ "$EDGE" != nginx ] && COMPOSE_FILES+=(-f docker-compose.behind-proxy.yml)
# exported so compose interpolation cannot fall back to a stale value in
# .env.prod if the two ever disagree
export APP_PORT
dc() { docker compose "${COMPOSE_FILES[@]}" --env-file .env.prod "$@"; }
# rewrite rather than append: a re-run that picks a different port must not be
# overruled by the value the first run left behind
if grep -q '^APP_PORT=' .env.prod 2>/dev/null; then
  sed -i "s/^APP_PORT=.*/APP_PORT=$APP_PORT/" .env.prod
else
  echo "APP_PORT=$APP_PORT" >> .env.prod
fi

# ── 4 · TLS ──────────────────────────────────────────────────────────────
say "TLS certificate for $DOMAIN"
have_cert() { [ -s deploy/certs/fullchain.pem ] && [ -s deploy/certs/privkey.pem ]; }

# Standalone needs port 80 to itself; behind an existing web server we use the
# webroot it is already serving, so nothing has to be stopped.
issue_letsencrypt() {
  [ -n "$EMAIL" ] || die "Let's Encrypt needs EMAIL=you@example.com"
  mkdir -p /var/www/certbot/.well-known/acme-challenge
  if [ "$EDGE" = nginx ]; then
    docker run --rm -p 80:80 -v "$PWD/deploy/letsencrypt:/etc/letsencrypt" \
      certbot/certbot certonly --standalone --non-interactive --agree-tos \
      -m "$EMAIL" -d "$DOMAIN"
  else
    docker run --rm -v "$PWD/deploy/letsencrypt:/etc/letsencrypt" \
      -v /var/www/certbot:/var/www/certbot \
      certbot/certbot certonly --webroot -w /var/www/certbot --non-interactive \
      --agree-tos -m "$EMAIL" -d "$DOMAIN"
  fi
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

# A private CA, rather than a bare self-signed certificate. Both are untrusted
# out of the box, but only one of them can be *made* trusted: install the root
# once on each machine that views the portal and the warning is gone for good.
# That is the only route to a real padlock on a host with no public DNS.
issue_internal_ca() {
  bash deploy/issue-internal-cert.sh "$DOMAIN" >/dev/null || return 1
  INTERNAL_CA=yes
}

if have_cert && [ "$TLS" != letsencrypt ] && [ "$TLS" != internal-ca ]; then
  ok "Certificate already present in deploy/certs — reusing it"
  [ -s deploy/certs/internal-ca.crt ] && INTERNAL_CA=yes
elif [ "$TLS" = selfsigned ]; then
  make_selfsigned; ok "Self-signed certificate created"
elif [ "$TLS" = internal-ca ]; then
  issue_internal_ca || die "could not issue from the internal CA"
  ok "Certificate issued from the internal CA"
elif [ "$TLS" = letsencrypt ]; then
  issue_letsencrypt; LE_ISSUED=yes; ok "Let's Encrypt certificate issued"
else
  # auto: only try Let's Encrypt if the name resolves publicly. It cannot
  # validate a host that is reachable only inside a private network, and it
  # cannot validate a name whose domain is not registered at all.
  PUBLIC_IP="$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || true)"
  if [ -n "$PUBLIC_IP" ] && [ -n "$EMAIL" ] &&
     ! printf '%s' "$PUBLIC_IP" | grep -qE '^(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)'; then
    if issue_letsencrypt; then LE_ISSUED=yes; ok "Let's Encrypt certificate issued"
    else warn "Let's Encrypt failed — issuing from the internal CA instead"; issue_internal_ca; fi
  else
    warn "$DOMAIN resolves to ${PUBLIC_IP:-nothing} — no public certificate is possible"
    if issue_internal_ca; then
      ok "Issued from the internal CA — install the root to get a trusted padlock"
    else
      warn "internal CA failed — falling back to self-signed"; make_selfsigned
    fi
  fi
fi

# ── 4b · Apache vhost ────────────────────────────────────────────────────
# Written in two passes. The :80 vhost goes up first so the ACME challenge can
# be answered; only once a certificate exists is the :443 vhost added. Doing it
# in one pass leaves Apache refusing to reload over a certificate file that is
# not there yet.
APACHE_SITE="/etc/apache2/sites-available/${DOMAIN}.conf"

# Apache treats <VirtualHost *:443> and <VirtualHost 10.0.0.5:443> as separate
# sets: a request arriving on the specific address never sees the wildcard
# vhosts, so ours would be invisible and the request would land on whatever the
# default server is. Match whatever convention this server already uses.
detect_vhost_addr() {
  local addr
  addr=$(apache2ctl -S 2>/dev/null |
    sed -n 's/^\([0-9][0-9.]*\):443[[:space:]]*is a NameVirtualHost.*/\1/p' |
    head -1 || true)
  [ -n "$addr" ] && printf '%s' "$addr" || printf '*'
}
VHOST_ADDR="${VHOST_ADDR:-$(detect_vhost_addr)}"
apache_reload() {
  apache2ctl configtest 2>&1 | grep -qi 'syntax ok' || {
    apache2ctl configtest; die "Apache config test failed — vhost left at $APACHE_SITE"; }
  systemctl reload apache2
}
write_apache_http() {
  mkdir -p /var/www/certbot/.well-known/acme-challenge
  cat > "$APACHE_SITE" <<VHOST
# Mundra Port Operations Portal — managed by portal/deploy/install.sh
<VirtualHost ${VHOST_ADDR}:80>
    ServerName $DOMAIN
    Alias /.well-known/acme-challenge/ /var/www/certbot/.well-known/acme-challenge/
    <Directory "/var/www/certbot">
        Require all granted
        Options -Indexes
    </Directory>
    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/\.well-known/acme-challenge/
    RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
    ErrorLog \${APACHE_LOG_DIR}/${DOMAIN}-error.log
    CustomLog \${APACHE_LOG_DIR}/${DOMAIN}-access.log combined
</VirtualHost>
VHOST
  a2ensite "${DOMAIN}.conf" >/dev/null
  apache_reload
}
write_apache_https() {
  local fullchain="$1" privkey="$2"
  cat >> "$APACHE_SITE" <<VHOST

<VirtualHost ${VHOST_ADDR}:443>
    ServerName $DOMAIN
    SSLEngine on
    SSLCertificateFile    $fullchain
    SSLCertificateKeyFile $privkey
    SSLProtocol -all +TLSv1.2 +TLSv1.3

    ProxyPreserveHost On
    ProxyRequests Off
    ProxyPass        / http://127.0.0.1:$APP_PORT/
    ProxyPassReverse / http://127.0.0.1:$APP_PORT/
    ProxyTimeout 75
    RequestHeader set X-Forwarded-Proto "https"
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"

    ErrorLog \${APACHE_LOG_DIR}/${DOMAIN}-error.log
    CustomLog \${APACHE_LOG_DIR}/${DOMAIN}-access.log combined
</VirtualHost>
VHOST
  apache_reload
}

if [ "$EDGE" = apache ]; then
  say "Apache vhost for $DOMAIN"
  for m in proxy proxy_http headers ssl rewrite; do a2enmod "$m" >/dev/null 2>&1 || true; done
  ok "modules enabled: proxy, proxy_http, headers, ssl, rewrite"
  if [ "$VHOST_ADDR" = '*' ]; then
    ok "vhost address: * (no address-specific vhosts on this server)"
  else
    ok "vhost address: $VHOST_ADDR (matching the existing vhosts on this server)"
  fi
  write_apache_http
  ok "HTTP vhost live (ACME challenge answerable)"
  if [ "${LE_ISSUED:-no}" = yes ]; then
    write_apache_https "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "/etc/letsencrypt/live/$DOMAIN/privkey.pem"
    ok "HTTPS vhost live on the Let's Encrypt certificate"
  else
    write_apache_https "$PWD/deploy/certs/fullchain.pem" "$PWD/deploy/certs/privkey.pem"
    ok "HTTPS vhost live on the self-signed certificate"
  fi
fi

# ── 5 · run ──────────────────────────────────────────────────────────────
say "Starting the stack"
dc up -d --build
ok "Containers up"

say "Waiting for the portal to answer"
for i in $(seq 1 90); do
  if dc exec -T portal node -e \
       'require("http").get("http://127.0.0.1:5200/api/health",r=>process.exit(r.statusCode===200?0:1)).on("error",()=>process.exit(1))' \
       2>/dev/null; then ok "Portal healthy after ${i}s"; break; fi
  [ "$i" -eq 90 ] && die "Portal did not become healthy — docker compose logs portal"
  sleep 1
done

# ── 6 · data ─────────────────────────────────────────────────────────────
if [ "$MODE" = demo ]; then
  say "Demo dataset"
  USERS=$(dc exec -T mongo mongosh --quiet mundra_portal --eval 'db.users.countDocuments()' 2>/dev/null | tr -dc '0-9' || true)
  if [ "${USERS:-0}" -gt 0 ]; then
    ok "Database already holds $USERS users — not reseeding"
  else
    dc exec -T portal node scripts/seed.js
    ok "Seeded the Mundra dataset"
  fi
fi

# ── 7 · backups and renewal ──────────────────────────────────────────────
say "Backups and certificate renewal"
mkdir -p /var/backups/portal
if [ "$EDGE" = apache ]; then RELOAD_CMD="systemctl reload apache2"
elif [ "$EDGE" = nginx ]; then RELOAD_CMD="cd $APP_DIR/portal && docker compose -f docker-compose.prod.yml -f docker-compose.behind-proxy.yml --env-file .env.prod restart nginx"
else RELOAD_CMD="true   # reload your own web server here"; fi
cat > /etc/cron.d/mundra-portal <<CRON
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# nightly database dump, 14-day retention
0 2 * * * root cd $APP_DIR/portal && docker compose ${COMPOSE_FILES[*]} --env-file .env.prod exec -T mongo mongodump --archive --quiet | gzip > /var/backups/portal/mundra-\$(date +\%F).gz && find /var/backups/portal -name 'mundra-*.gz' -mtime +14 -delete
# monthly certificate renewal
0 3 1 * * root cd $APP_DIR/portal && docker run --rm -v "\$PWD/deploy/letsencrypt:/etc/letsencrypt" -v /var/www/certbot:/var/www/certbot certbot/certbot renew --webroot -w /var/www/certbot --quiet && cp -f deploy/letsencrypt/live/$DOMAIN/*.pem deploy/certs/ 2>/dev/null; $RELOAD_CMD
# internal CA: reissue the server certificate within 30 days of expiry. The root
# is untouched, so every copy already installed on a laptop keeps working.
0 4 1 * * root cd $APP_DIR/portal && bash deploy/issue-internal-cert.sh $DOMAIN --if-due >/dev/null 2>&1 && $RELOAD_CMD
CRON
chmod 644 /etc/cron.d/mundra-portal
ok "Nightly dump to /var/backups/portal, monthly cert renewal"

# A name that does not resolve makes the server unable to reach its own portal:
# smoke.sh, a browser on the box and curl all fail on the name even though the
# vhost is correct. A hosts entry costs nothing and is trivially reversible. We
# add one only when the name resolves nowhere at all — never when it resolves to
# something else, because that is somebody's deliberate DNS.
if [ -z "${RESOLVED:-}" ] && ! grep -q "[[:space:]]$DOMAIN\([[:space:]]\|$\)" /etc/hosts 2>/dev/null; then
  HOSTS_IP="$VHOST_ADDR"; [ "$HOSTS_IP" = '*' ] && HOSTS_IP=127.0.0.1
  printf '%s %s  # mundra-portal — remove with: sed -i "/mundra-portal/d" /etc/hosts\n' \
    "$HOSTS_IP" "$DOMAIN" >> /etc/hosts
  ok "hosts entry added: $HOSTS_IP $DOMAIN (this server can now use the name)"
fi

# ── 8 · verify ───────────────────────────────────────────────────────────
say "Verifying"
APP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:$APP_PORT/api/health" 2>/dev/null)
[ "$APP_CODE" = 200 ] && ok "application on 127.0.0.1:$APP_PORT → 200" \
                      || warn "application returned $APP_CODE on the loopback port"
VERIFY_HOST="$VHOST_ADDR"; [ "$VERIFY_HOST" = '*' ] && VERIFY_HOST=127.0.0.1
# --resolve rather than -H Host: Apache picks the SSL vhost by SNI, and a Host
# header leaves SNI pointing at the IP, which can select the wrong certificate.
EDGE_CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 \
  --resolve "$DOMAIN:443:$VERIFY_HOST" "https://$DOMAIN/api/health" 2>/dev/null)
if [ "$EDGE_CODE" = 200 ]; then
  ok "through TLS as $DOMAIN on $VERIFY_HOST → 200"
else
  if [ "$EDGE_CODE" = 000 ] || [ -z "$EDGE_CODE" ]; then
    warn "nothing answered on $VERIFY_HOST:443 — is Apache listening there?"
    warn "  check: ss -lntp | grep ':443 '   and   apache2ctl -S"
  else
    warn "edge returned HTTP $EDGE_CODE — check the vhost order in apache2ctl -S"
  fi
fi

# Built here rather than inside the summary heredoc: a command substitution
# nested in a heredoc mangles the escaping, and a broken awk program in a
# banner is a silly way to lose an IP address.
CA_NOTE=""
if [ "${INTERNAL_CA:-no}" = yes ]; then
  HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || true)
  [ -n "$HOST_IP" ] || HOST_IP="$VHOST_ADDR"
  CA_NOTE=$(cat <<CANOTE

  ─ Trusted padlock ─────────────────────────────────────────────
  This host has no public DNS, so no public CA can sign for it. The
  certificate comes from a private CA instead. Install its root on
  each machine that opens the portal and the warning disappears:

    scp root@$HOST_IP:$APP_DIR/portal/deploy/certs/internal-ca.crt .

    macOS    sudo security add-trusted-cert -d -r trustRoot \\
               -k /Library/Keychains/System.keychain internal-ca.crt
    Windows  certutil -addstore -f Root internal-ca.crt   (as Administrator)
    Ubuntu   sudo cp internal-ca.crt /usr/local/share/ca-certificates/ \\
               && sudo update-ca-certificates
    Firefox  Settings → Privacy & Security → Certificates → View
             Certificates → Authorities → Import → tick websites

  Keep internal-ca.key private and never regenerate it — doing so
  invalidates every copy of the root already installed.
  ───────────────────────────────────────────────────────────────
CANOTE
)
fi

cat <<SUMMARY

────────────────────────────────────────────────────────────────
  Portal        https://$DOMAIN
  Edge          $EDGE$([ "$EDGE" = apache ] && echo " — vhost at $APACHE_SITE" || true)
  Application   127.0.0.1:$APP_PORT $([ "$EDGE" != nginx ] && echo '(loopback only)' || true)
  Mode          $MODE $([ "$MODE" = demo ] && echo '(seeded Mundra dataset)' || echo '(empty database)')
  Directory     $APP_DIR/portal
  Secrets       $APP_DIR/portal/.env.prod   ← back this up
  Certificates  $APP_DIR/portal/deploy/certs
${CA_NOTE}
  Backups       /var/backups/portal (nightly, 14 days)

  Sign in       admin@mundraport.in / Mundra@2026
                That password is published in the repository. Change it now:
                bash $APP_DIR/portal/deploy/change-admin-password.sh https://$DOMAIN

  Logs          cd $APP_DIR/portal && docker compose ${COMPOSE_FILES[*]} --env-file .env.prod logs -f
  Restart       … restart
  Update        git pull && … up -d --build
────────────────────────────────────────────────────────────────
SUMMARY
