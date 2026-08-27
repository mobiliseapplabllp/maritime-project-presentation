#!/usr/bin/env bash
# Read-only survey of a deployed portal host. Changes nothing, starts nothing,
# stops nothing. Run it, paste the output.
#
#   sudo bash /opt/portal/portal/deploy/audit.sh
#
# Secret VALUES are never printed — only which keys are set and how long they
# are — so the output is safe to paste into a chat or an email.
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/portal}"
PORTAL="$APP_DIR/portal"
DOMAIN="${DOMAIN:-}"

h()   { printf '\n\033[1;36m── %s %s\033[0m\n' "$1" "$(printf '─%.0s' $(seq 1 $((66 - ${#1}))))"; }
kv()  { printf '  %-26s %s\n' "$1" "${2:-—}"; }
has() { command -v "$1" >/dev/null 2>&1; }

printf '\n\033[1m PORTAL HOST AUDIT — %s — %s\033[0m\n' "$(hostname)" "$(date -u '+%Y-%m-%d %H:%M UTC')"

h "Host"
kv "hostname"   "$(hostname -f 2>/dev/null || hostname)"
kv "os"         "$(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"
kv "kernel"     "$(uname -r)"
kv "uptime"     "$(uptime -p 2>/dev/null | sed 's/^up //')"
kv "cpus"       "$(nproc 2>/dev/null)"
kv "memory"     "$(free -h 2>/dev/null | awk '/^Mem:/{print $3" used of "$2", "$7" available"}')"
kv "load"       "$(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)"
kv "addresses"  "$(hostname -I 2>/dev/null)"
kv "timezone"   "$(timedatectl show -p Timezone --value 2>/dev/null || cat /etc/timezone 2>/dev/null)"

h "Disk"
df -h / /opt /var 2>/dev/null | awk 'NR==1 || !seen[$1]++' | sed 's/^/  /'
kv "docker uses" "$(du -sh /var/lib/docker 2>/dev/null | cut -f1)"
kv "backups use" "$(du -sh /var/backups/portal 2>/dev/null | cut -f1)"

h "Deployment"
kv "app dir"    "$([ -d "$PORTAL" ] && echo "$PORTAL" || echo 'NOT FOUND')"
if [ -d "$APP_DIR/.git" ]; then
  kv "branch"   "$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  kv "commit"   "$(git -C "$APP_DIR" log -1 --format='%h %s' 2>/dev/null | cut -c1-70)"
  kv "committed" "$(git -C "$APP_DIR" log -1 --format='%ci' 2>/dev/null)"
  kv "local edits" "$(git -C "$APP_DIR" status --porcelain 2>/dev/null | wc -l) file(s)"
else
  kv "git"      "not a checkout"
fi

h "Secrets (names and lengths only — no values)"
if [ -f "$PORTAL/.env.prod" ]; then
  kv "file"     "$PORTAL/.env.prod  (mode $(stat -c '%a' "$PORTAL/.env.prod" 2>/dev/null), owner $(stat -c '%U' "$PORTAL/.env.prod" 2>/dev/null))"
  while IFS='=' read -r k v; do
    case "$k" in ''|\#*) continue ;; esac
    case "$k" in
      *SECRET*|*PASSWORD*|*TOKEN*|*KEY*|*URI*|*URL*)
        printf '  %-26s set, %d chars\n' "$k" "${#v}" ;;
      *) printf '  %-26s %s\n' "$k" "$v" ;;
    esac
  done < "$PORTAL/.env.prod"
  # The one rule that matters: these two must never be the same value.
  J=$(grep -m1 '^JWT_SECRET=' "$PORTAL/.env.prod" | cut -d= -f2-)
  C=$(grep -m1 '^CERT_SIGNING_SECRET=' "$PORTAL/.env.prod" | cut -d= -f2-)
  if [ -n "$C" ] && [ "$J" = "$C" ]; then
    printf '  \033[31m!! CERT_SIGNING_SECRET equals JWT_SECRET — rotating JWT would void every certificate\033[0m\n'
  elif [ -n "$C" ]; then
    printf '  \033[32m✓\033[0m CERT_SIGNING_SECRET is distinct from JWT_SECRET\n'
  else
    printf '  \033[31m!! CERT_SIGNING_SECRET is not set\033[0m\n'
  fi
else
  kv "file"     "MISSING — the stack cannot start"
fi

h "Docker"
if has docker; then
  kv "version"  "$(docker --version 2>/dev/null)"
  kv "compose"  "$(docker compose version --short 2>/dev/null)"
  DINFO=$(docker info --format '{{.ServerVersion}} · {{.Driver}} · {{.OperatingSystem}}' 2>/dev/null | tr '\n' ' ' | sed 's/ *$//')
  case "$DINFO" in ''|*'·  ·'*|' · · ') DINFO="not responding" ;; esac
  kv "daemon"   "$DINFO"
  echo
  docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null | sed 's/^/  /' | head -20
  echo
  kv "images"   "$(docker images -q 2>/dev/null | wc -l) · $(docker system df --format '{{.Type}} {{.Size}}' 2>/dev/null | tr '\n' ' ')"
else
  kv "docker"   "NOT INSTALLED"
fi

h "Application"
APP_PORT=$(grep -m1 '^APP_PORT=' "$PORTAL/.env.prod" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
APP_PORT="${APP_PORT:-5200}"
kv "loopback port" "$APP_PORT"
HEALTH=$(curl -s --max-time 8 "http://127.0.0.1:$APP_PORT/api/health" 2>/dev/null)
kv "GET /api/health" "$(printf '%s' "$HEALTH" | head -c 160)"
kv "status code" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://127.0.0.1:$APP_PORT/api/health" 2>/dev/null)"

h "Database"
MONGO=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i mongo | head -1)
if [ -n "$MONGO" ]; then
  kv "container" "$MONGO ($(docker inspect -f '{{.State.Status}}, health {{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}}' "$MONGO" 2>/dev/null))"
  DB=$(grep -m1 '^MONGO_DB=' "$PORTAL/.env.prod" 2>/dev/null | cut -d= -f2 | tr -d '[:space:]')
  DB="${DB:-mundra_portal}"
  docker exec "$MONGO" mongosh --quiet --eval "
    db = db.getSiblingDB('$DB');
    var out = [];
    db.getCollectionNames().sort().forEach(function(c){
      var n = db.getCollection(c).countDocuments();
      if (n > 0) out.push(('        ' + n).slice(-8) + '  ' + c);
    });
    print(out.join('\n'));
  " 2>/dev/null | sed 's/^/  /' | head -45 || kv "query" "mongosh unavailable in the container"
else
  kv "container" "no mongo container running"
fi

h "Web server (edge)"
if has apache2ctl; then
  kv "apache"   "$(apache2ctl -v 2>/dev/null | head -1 | sed 's/Server version: //')"
  kv "running"  "$(systemctl is-active apache2 2>/dev/null)"
  kv "configtest" "$(apache2ctl configtest 2>&1 | tail -1)"
  echo "  vhost map:"
  apache2ctl -S 2>/dev/null | sed 's/^/    /' | head -30
  if [ -n "$DOMAIN" ] && [ -f "/etc/apache2/sites-available/$DOMAIN.conf" ]; then
    echo "  our vhost:"
    grep -E '<VirtualHost|ServerName|ProxyPass |SSLCertificate' "/etc/apache2/sites-available/$DOMAIN.conf" | sed 's/^/    /'
  fi
elif has nginx; then
  kv "nginx"    "$(nginx -v 2>&1)"
  kv "running"  "$(systemctl is-active nginx 2>/dev/null)"
else
  kv "edge"     "neither apache nor nginx on the host"
fi

h "TLS"
for f in fullchain.pem internal-ca.crt; do
  P="$PORTAL/deploy/certs/$f"
  [ -s "$P" ] || { kv "$f" "absent"; continue; }
  S=$(openssl x509 -in "$P" -noout -subject 2>/dev/null | sed 's/subject=//')
  I=$(openssl x509 -in "$P" -noout -issuer  2>/dev/null | sed 's/issuer=//')
  E=$(openssl x509 -in "$P" -noout -enddate 2>/dev/null | cut -d= -f2)
  DAYS=$(( ( $(date -d "$E" +%s 2>/dev/null || echo 0) - $(date +%s) ) / 86400 ))
  kv "$f" "$S"
  kv "  issued by" "$I"
  kv "  expires"   "$E  (${DAYS} days)"
  [ "$DAYS" -lt 30 ] && kv "  !!" "expires in under 30 days"
  if [ "$f" = internal-ca.crt ]; then
    # A root is self-signed by definition. That is what a root is.
    kv "  note" "private root — install on client machines to get a trusted padlock"
  elif [ "$S" = "$I" ]; then
    kv "  !!" "self-signed leaf — untrusted, and nothing can be installed to fix it"
  else
    kv "  note" "issued by a CA — trusted wherever that CA is trusted"
  fi
done
kv "private key" "$([ -s "$PORTAL/deploy/certs/privkey.pem" ] && stat -c 'mode %a, owner %U' "$PORTAL/deploy/certs/privkey.pem" 2>/dev/null || echo absent)"

h "Listening ports"
if has ss; then ss -lntp 2>/dev/null | sed 's/^/  /' | head -30
elif has netstat; then netstat -lntp 2>/dev/null | sed 's/^/  /' | head -30
else kv "tools" "neither ss nor netstat"; fi

h "Firewall"
if has ufw; then kv "ufw" "$(ufw status 2>/dev/null | head -1)"; ufw status numbered 2>/dev/null | sed 's/^/  /' | head -15; fi
if has iptables; then kv "iptables INPUT" "$(iptables -L INPUT -n 2>/dev/null | tail -n +3 | wc -l) rule(s), policy $(iptables -L INPUT -n 2>/dev/null | head -1 | sed 's/.*policy \([A-Z]*\).*/\1/')"; fi
has ufw || has iptables || kv "tools" "neither ufw nor iptables present" 

h "Scheduled jobs"
[ -f /etc/cron.d/mundra-portal ] && grep -v '^#' /etc/cron.d/mundra-portal | grep -v '^$' | cut -c1-150 | sed 's/^/  /' || kv "cron" "no /etc/cron.d/mundra-portal"

h "Backups"
if [ -d /var/backups/portal ]; then
  kv "count" "$(find /var/backups/portal -type f 2>/dev/null | wc -l)"
  ls -lht /var/backups/portal 2>/dev/null | head -6 | tail -5 | sed 's/^/  /'
else
  kv "dir" "/var/backups/portal does not exist"
fi

h "Name resolution"
for n in "$DOMAIN" localhost; do
  [ -n "$n" ] || continue
  kv "$n" "$(getent hosts "$n" 2>/dev/null | awk '{print $1}' | tr '\n' ' ' || echo 'does not resolve')"
done
kv "hosts entries" "$(grep -c . /etc/hosts 2>/dev/null) line(s)$([ -n "$DOMAIN" ] && grep -q "$DOMAIN" /etc/hosts 2>/dev/null && echo ", including $DOMAIN")"

h "Recent application log"
if [ -n "${MONGO:-}" ] || has docker; then
  P=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -i 'portal-portal' | head -1)
  [ -n "$P" ] && docker logs --tail 25 "$P" 2>&1 | sed 's/^/  /' || kv "logs" "portal container not running"
fi

printf '\n\033[1m Audit complete. No changes were made.\033[0m\n\n'
