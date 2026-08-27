# Deployment — Dev → UAT → Production

The same Docker image moves through three separated environments; only
environment variables differ. What is accepted in UAT is exactly what runs in
production.

```
DEV ──────────────► UAT ──────────────► PROD
feature work        client acceptance    hardened, TLS, backups
auto-seeded data    release candidates   never auto-seeded
tests run here      sign-off gates prod  approved releases only
```

## Dev (default)

```bash
cd portal
docker compose up --build
# → http://localhost:5200 — seeds the full Mundra dataset on first run
```

Before promoting anything: `npm test && npm run test:api && npm run test:security`
(backend) and `npm run build` (frontend) must be green.

## UAT

```bash
cp .env.uat.example .env.uat        # once — fill in secrets
docker compose -f docker-compose.yml -f docker-compose.uat.yml --env-file .env.uat up -d --build
# → http://<host>:5300 with the acceptance dataset
```

Refresh acceptance data for a new release:
`docker compose -f docker-compose.yml -f docker-compose.uat.yml --env-file .env.uat down -v` then `up` again.
The port team validates workflows here; sign-off gates production.

## Production

```bash
cp .env.prod.example .env.prod      # once — generate secrets: openssl rand -hex 48
mkdir -p deploy/certs               # fullchain.pem + privkey.pem
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
# → https://<domain> — only nginx (80/443) is exposed; app + DB stay internal
```

**TLS certificates** — with a domain pointed at the host:

```bash
docker run --rm -p 80:80 -v "$PWD/deploy/certs:/out" certbot/certbot certonly \
  --standalone -d portal.example.in --agree-tos -m ops@example.in -n \
  --cert-path /out
# copy the issued fullchain.pem + privkey.pem into deploy/certs, then restart nginx
```

(Any CA works — mount the pair into `deploy/certs`. Renew certbot certs monthly
via cron and `docker compose restart nginx`.)

**Backups** — nightly dump, 14-day retention:

```bash
# /etc/cron.d/mundra-backup
0 2 * * * root docker compose -f /opt/portal/docker-compose.prod.yml exec -T mongo \
  mongodump --archive | gzip > /var/backups/mundra-$(date +\%F).gz && \
  find /var/backups -name 'mundra-*.gz' -mtime +14 -delete
```

**Rules of the road**

- Production is never auto-seeded (`SEED_IF_EMPTY=0`) and never edited by hand.
- Rotate `JWT_SECRET` / `JWT_REFRESH_SECRET` on any secrets exposure; all
  sessions re-authenticate on rotation.
- **Never rotate `CERT_SIGNING_SECRET`.** See below.
- Changes reach production only as approved releases promoted from UAT.
- See `SECURITY.md` for the hardening inventory and pre-release checklist.

## TLS on a host with no public DNS

A public certificate authority will only sign for a name it can validate, and
both of its methods need public DNS: HTTP-01 resolves the name and connects to
it, DNS-01 places a TXT record in its zone. A host that is reachable only over
a VPN, or whose domain is not publicly registered, can satisfy neither. No
amount of configuration changes that.

A self-signed certificate is the usual fallback and it is a poor one, because
it is untrusted by definition — the browser warns and there is nothing you can
install to stop it warning. The installer uses a small private CA instead:

```bash
sudo TLS=internal-ca bash deploy/install.sh
```

This generates a root once, keeps it in `deploy/certs/internal-ca.key`, and
issues the server certificate from it. Install the root on each machine that
opens the portal and the padlock is green — a real one, verified, not an
exception clicked through.

```bash
scp root@<host>:/opt/portal/portal/deploy/certs/internal-ca.crt .

# macOS
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain internal-ca.crt
# Windows, as Administrator
certutil -addstore -f Root internal-ca.crt
# Ubuntu / Debian
sudo cp internal-ca.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates
```

Firefox keeps its own trust store: Settings → Privacy & Security → Certificates
→ View Certificates → Authorities → Import, and tick trust for websites.

The server certificate is valid for 397 days, which keeps every platform happy
— macOS and iOS reject anything over 825 days, and Chrome caps publicly-trusted
certificates at 398. A monthly cron reissues it within 30 days of expiry, from
the same root, so nothing needs reinstalling on anybody's laptop.

> **Never regenerate the root.** `deploy/issue-internal-cert.sh` creates it only
> when it is missing, and that check is the whole safety mechanism. Deleting
> `internal-ca.key` or `internal-ca.crt` and re-running mints a *different* CA,
> and every copy already installed stops matching. Back both files up with
> `.env.prod`, and keep the key private — anyone holding it can issue a
> certificate your machines will trust.

If the host later gets a public name, switch with
`sudo TLS=letsencrypt DOMAIN=<name> bash deploy/install.sh` and the renewal
cron takes over from there.

## The seeded administrator account

The demo dataset ships with `admin@mundraport.in` / `Mundra@2026`, and that
password is in this repository for anyone to read. On any host somebody else
can reach, change it before you do anything else:

```bash
bash deploy/change-admin-password.sh https://<domain>
```

It prompts rather than taking arguments, so nothing lands in your shell history
or the process list, and it proves the change by signing in with the new
password and confirming the old one is refused. The change is recorded in the
audit log as `PASSWORD_CHANGE`.

Rotating this password is unrelated to the two secrets above — it changes one
bcrypt hash in the database and nothing else. Sessions already issued stay
valid until they expire.

## The certificate signing key

Every instrument the registry issues is signed with Ed25519 over the register
entry itself, and public verification recomputes that entry rather than reading
a stored payload. That is what makes the record tamper-evident: alter a
certificate's holder, expiry or number after issue and verification fails.

The signing key is derived from `CERT_SIGNING_SECRET`. It has one rule:

> Generate it once, before the first certificate is issued, and never change it.

Rotating it does not invalidate a session — it invalidates **every certificate
ever issued**, which will then verify as *"signed by a key this registry no
longer holds"*. There is no way to re-sign historical records without changing
their issue dates, so the damage is permanent.

Two consequences worth stating plainly:

- Keep it out of the JWT rotation runbook. `JWT_SECRET` is meant to be rotated;
  this is not, and the two must never be the same value. If `CERT_SIGNING_SECRET`
  is unset the code falls back to `JWT_SECRET`, which is convenient in
  development and dangerous in production — so all three compose files now set
  it explicitly, and prod and UAT refuse to start without it.
- Back it up with the same care as the database. Losing it is equivalent to
  losing the register's signature history.

Publish the public half — `GET /api/public/signing-key` serves it
unauthenticated, so anyone holding a certificate can verify it without asking
this platform for permission.
