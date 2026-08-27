#!/usr/bin/env bash
# Issue a TLS certificate for an internal host from a small private CA.
#
#   ./issue-internal-cert.sh apdev.onmobilise.co.in          issue or reissue
#   ./issue-internal-cert.sh apdev.onmobilise.co.in --if-due  only within 30 days of expiry
#
# Why this exists. A self-signed certificate is untrusted by definition: the
# browser warns and there is nothing you can install to stop it warning. A
# private CA fixes that properly — the root is installed once on each machine
# that views the portal, and every certificate issued from it is then trusted.
# It needs no public DNS, no registered domain and no inbound reachability,
# which is exactly the situation on a VPN-only host.
#
# Run from the portal directory (the one holding docker-compose.prod.yml).
set -euo pipefail

DOMAIN="${1:-}"
[ -n "$DOMAIN" ] || { echo "usage: $0 <domain> [--if-due]" >&2; exit 2; }
IF_DUE="${2:-}"

CERTS=deploy/certs
CA_KEY="$CERTS/internal-ca.key"
CA_CRT="$CERTS/internal-ca.crt"
LEAF="$CERTS/fullchain.pem"
KEY="$CERTS/privkey.pem"

mkdir -p "$CERTS"

if [ "$IF_DUE" = --if-due ] && [ -s "$LEAF" ]; then
  # 30 days of headroom. Nothing to do if the current certificate outlives it.
  if openssl x509 -in "$LEAF" -noout -checkend $((30*24*3600)) >/dev/null 2>&1; then
    exit 0
  fi
fi

# The root is generated once and then never touched. Regenerating it would
# invalidate every copy already installed on somebody's laptop, so the check
# below is the whole safety mechanism.
if [ ! -s "$CA_KEY" ] || [ ! -s "$CA_CRT" ]; then
  openssl req -x509 -newkey rsa:4096 -nodes -days 3650 \
    -keyout "$CA_KEY" -out "$CA_CRT" \
    -subj "/CN=Mobilise App Lab Internal CA/O=Mobilise App Lab/C=IN" \
    -addext "basicConstraints=critical,CA:true,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  chmod 600 "$CA_KEY"
  echo "created a new internal CA at $CA_CRT"
fi

# Every address this host answers on, so the certificate is valid whether it is
# reached by name, by private IP or over the loopback.
SAN="DNS:$DOMAIN,DNS:localhost,IP:127.0.0.1$(
  ip -4 -o addr show scope global 2>/dev/null |
  awk '{split($4,a,"/"); printf ",IP:%s", a[1]}' || true)"

CSR=$(mktemp) ; EXT=$(mktemp) ; CRT=$(mktemp)
trap 'rm -f "$CSR" "$EXT" "$CRT"' EXIT

printf 'subjectAltName=%s\nbasicConstraints=critical,CA:false\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' \
  "$SAN" > "$EXT"

openssl req -new -newkey rsa:2048 -nodes -keyout "$KEY" -out "$CSR" \
  -subj "/CN=$DOMAIN/O=Mobilise App Lab/C=IN" 2>/dev/null

# 397 days. macOS and iOS reject any server certificate valid for more than 825
# days, and Chrome caps publicly-trusted ones at 398; staying under a year keeps
# every platform happy and this script reissues before it lapses.
openssl x509 -req -in "$CSR" -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial \
  -days 397 -sha256 -extfile "$EXT" -out "$CRT" 2>/dev/null

cat "$CRT" "$CA_CRT" > "$LEAF"
chmod 600 "$KEY"

echo "issued $DOMAIN, valid until $(openssl x509 -in "$CRT" -noout -enddate | cut -d= -f2)"
