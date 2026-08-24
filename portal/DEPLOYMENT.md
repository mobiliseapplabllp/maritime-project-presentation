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
- Changes reach production only as approved releases promoted from UAT.
- See `SECURITY.md` for the hardening inventory and pre-release checklist.
