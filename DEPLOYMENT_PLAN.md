# Aventer Deployment Plan

**Date:** July 7, 2026  
**Status:** Recommended approach for beta  
**Domain:** [aventer.dev](https://aventer.dev)  
**Related:** [README](./README.md) · [AEW Beta Prototype Plan](../../Content/Agents%20Events%20Webhooks/AEW_BETA_PROTOTYPE_PLAN.md)

---

## 1. Summary

**Recommendation: Vercel + Hetzner VPS hybrid.**

Use Vercel for everything that is static or marketing-facing. Run the API and delivery worker on a **small Hetzner VPS** — always-on, cheap, and well-suited to SSE streams and background workers. Use Postgres on the same VPS (simplest/cheapest for beta) or Neon if you prefer managed DB.

| Surface | Host | URL |
|---|---|---|
| Marketing / landing | **Vercel** | `aventer.dev`, `www.aventer.dev` |
| Beta dashboard | **Vercel** | `beta.aventer.dev` |
| Ingest API + SSE | **Hetzner VPS** | `api.aventer.dev` |
| Delivery worker | **Hetzner VPS** (same box) | internal (systemd service) |
| Database | **Postgres on VPS** or **Neon** | localhost or private connection string |

This gives you Vercel's DX for the surfaces users see, Hetzner's price and control for the backend, and avoids serverless timeout limits on SSE and delivery retries.

---

## 2. Why Not All-Vercel?

Vercel is an excellent fit for the dashboard and landing page. It is a poor sole host for Aventer as architected today.

| Requirement | Vercel limitation | Impact |
|---|---|---|
| **SSE live stream** (`/v1/events/stream`) | Serverless function timeouts (60s Hobby, 300s Pro); connections drop on cold start | Dashboard disconnects during demos |
| **In-memory event store** | Each invocation is isolated; no shared memory between instances | Events disappear; SSE subscribers on different instances miss events |
| **Delivery worker** (Phase 2) | No long-running processes; retries over 20 minutes don't fit serverless | Cannot implement retry policy from strategy doc |
| **Webhook outbound** | Doable via serverless, but retry scheduling needs a queue + worker | Requires external queue anyway |

**Vercel-only is viable later** if you refactor to: Postgres for storage, Upstash Redis for SSE pub/sub, and a queue (Upstash QStash or SQS) for delivery — with the worker still likely living outside Vercel. That adds complexity before you've validated beta demand.

---

## 3. Recommended Architecture

```
                         ┌─────────────────────────────────┐
                         │  Vercel                          │
  aventer.dev ──────────►│  Landing (static / Next.js)      │
  beta.aventer.dev ────►│  Dashboard (Vite → static)       │
                         └──────────────┬──────────────────┘
                                        │ HTTPS (API calls)
                                        ▼
                         ┌─────────────────────────────────┐
                         │  Hetzner VPS (e.g. CX22)         │
  api.aventer.dev ──────►│  Caddy → :3001 @aventer/api      │
                         │    POST /v1/events               │
                         │    GET  /v1/events               │
                         │    GET  /v1/events/stream (SSE)  │
                         │  systemd → @aventer/worker       │
                         └──────────────┬──────────────────┘
                                        │
                              ┌─────────▼─────────┐
                              │  Postgres          │
                              │  (on VPS or Neon)  │
                              └───────────────────┘
```

### Service responsibilities

**Vercel — dashboard (`services/dashboard`)**
- Build: `npm run build -w @aventer/dashboard`
- Output: `services/dashboard/dist` (static)
- Env: `VITE_API_URL=https://api.aventer.dev`
- Dashboard connects SSE directly to `api.aventer.dev` (not through Vercel proxy) to avoid double-hop timeout issues

**Vercel — marketing (`aventer.dev`)**
- Phase 0: single-page static site or Next.js landing
- Can live in `apps/www/` or a separate repo; not blocking beta

**Hetzner VPS — API + worker (`services/api`, `services/worker`)**
- Single CX22/CPX11 runs API, worker, Caddy, and Postgres comfortably for beta
- API: Node process on `:3001`, proxied by Caddy with automatic TLS
- Worker: second systemd unit; polls delivery queue from Postgres
- Health check: `GET /health` (Caddy or direct curl)
- Deploy: `git pull` + `npm run build` + `systemctl restart` (or GitHub Actions over SSH)

**Postgres — on VPS or Neon**
- **On VPS (recommended for beta):** Postgres 16 via Docker or native install; `DATABASE_URL=postgresql://aventer@localhost/aventer`
- **Neon (alternative):** Managed, branching for migrations; useful if you want DB backups off-box without setting them up yourself
- Tables: `projects`, `api_keys`, `events`, `subscribers`, `deliveries`, `dlq`

**Neon — managed Postgres (optional)**
- Skip if Postgres runs on the VPS; use Neon when you outgrow one box or want PR-branch databases

---

## 4. Platform Comparison

### Option A — Vercel + Hetzner VPS (recommended)

| Pros | Cons |
|---|---|
| **~€4–6/mo** for CX22/CPX11 — API + worker + Postgres on one box | You own OS updates, backups, and firewall |
| SSE and long-running workers with zero platform hacks | Single point of failure until you add a second VPS |
| Full control — matches your existing Hetzner experience | Deploy is DIY (git pull or Actions SSH), not git-push-to-deploy |
| Vercel still handles dashboard + marketing | EU-only by default (often fine; US regions available) |
| No Fly/Railway metered egress surprises | |

**Suggested VPS:** [Hetzner CX22](https://www.hetzner.com/cloud) (2 vCPU, 4 GB RAM, 40 GB) — ~€4.5/mo. CPX11 works too if you prefer AMD.

**Best for:** Beta with 10–20 AI engineers, cost-conscious, ops-comfortable teams.

### Option B — Vercel + Railway + Neon

| Pros | Cons |
|---|---|
| Git-push deploy, no server admin | No free tier; typically $5–20/mo+ |
| Managed runtime | Less control than VPS |

**Best for:** If you want zero server maintenance and cost is secondary.

### Option C — Vercel + Fly.io + Neon

Same as Option B. Fly.io pricing can spike with egress and always-on machines — you've seen this.

**Best for:** Multi-region edge if cost is not a concern.

### Option D — AWS (App Runner + RDS + SQS)

| Component | AWS service |
|---|---|
| Dashboard + marketing | S3 + CloudFront (or keep Vercel for these) |
| API | App Runner or ECS Fargate |
| Worker | ECS Fargate or Lambda + SQS (Lambda alone insufficient for 20-min retry window) |
| Database | RDS Postgres (or Aurora Serverless v2) |
| Queue | SQS + DLQ |
| Secrets | Secrets Manager |
| DNS | Route 53 |

| Pros | Cons |
|---|---|
| Production-grade from the start | Highest setup time (days, not hours) |
| SQS maps cleanly to delivery retry policy | RDS minimum cost ~$15–30/mo even idle |
| Fine-grained IAM, VPC, compliance | Overkill for 15-person beta |

**Best for:** Enterprise beta, existing AWS footprint, or compliance requirements.

### Option E — All Vercel + Neon + Upstash

| Pros | Cons |
|---|---|
| Single vendor for frontend + API routes | SSE requires Redis pub/sub refactor |
| | Worker still needs Vercel Cron (max 300s) or external queue consumer |
| | More code changes before first deploy |

**Best for:** After beta, if you want to consolidate — not the fastest path today.

---

## 5. DNS (aventer.dev)

Configure at your registrar (or Cloudflare in front of everything):

| Record | Type | Target | Notes |
|---|---|---|---|
| `@` | A / ALIAS | Vercel | Marketing |
| `www` | CNAME | `cname.vercel-dns.com` | Redirect to apex |
| `beta` | CNAME | `cname.vercel-dns.com` | Dashboard project |
| `api` | A | Hetzner VPS public IPv4 | Point `api.aventer.dev` → VPS IP |

**SSL:** Caddy on the VPS handles `api.aventer.dev` via Let's Encrypt (automatic on first request). Vercel handles dashboard/marketing certs.

**Optional:** Cloudflare in front of `api.aventer.dev` for DDoS protection and caching (disable cache on `/v1/*`). Set SSL mode to **Full (strict)** and origin cert or Let's Encrypt on Caddy.

**CAA records:** Allow Let's Encrypt and your host's CA if configured.

---

## 6. Pre-Deploy Code Changes

The repo works locally but needs these changes before production:

### 6.1 Replace in-memory store (required)

Current `services/api/src/store.ts` keeps events in a process-local array. Production requires:

- [ ] Postgres schema migration (`events`, indexes on `project_id`, `created_at`)
- [ ] API reads/writes via SQL instead of in-memory array
- [ ] SSE fan-out via Postgres `LISTEN/NOTIFY`, Redis pub/sub, or polling fallback (simplest for beta: NOTIFY)

### 6.2 API entry point for containers

Export Hono app without binding port in module scope; start server only when run directly:

```typescript
// services/api/src/index.ts pattern
export default app;

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3001) });
}
```

Railway/Fly set `PORT` automatically. On Hetzner, set `PORT=3001` in systemd unit or `.env`.

### 6.3 Dashboard API URL

Update `services/dashboard/src/main.ts` to use env-injected base URL:

```typescript
const API_URL = import.meta.env.VITE_API_URL ?? "";
// EventSource(`${API_URL}/v1/events/stream?api_key=...`)
```

Local dev: `VITE_API_URL=` (empty, Vite proxy handles `/v1`).  
Production: `VITE_API_URL=https://api.aventer.dev`.

### 6.4 CORS

Add CORS middleware on API for `https://beta.aventer.dev` (browser SSE + fetch from dashboard origin).

### 6.5 Secrets

- Remove hardcoded `avn_beta_dev_key_change_me` default in production
- Store secrets in `/etc/aventer/env` or systemd `EnvironmentFile` on VPS; Vercel dashboard for frontend env vars
- Never commit `.env` files

### 6.6 SDK default URL

`@aventer/sdk` already defaults to `https://api.aventer.dev` — no change needed after DNS is live.

---

## 7. Deployment Steps

### Phase 0 — Accounts & DNS (day 1)

1. Provision Hetzner CX22 (Ubuntu 24.04 LTS; Falkenstein or Ashburn)
2. Connect Vercel to GitHub repo
3. Point DNS records (§5): `api` → VPS IPv4
4. Optional: create Neon project if not using on-VPS Postgres

### Phase 1 — VPS bootstrap (day 1)

```bash
# On fresh Ubuntu VPS (as root or via sudo)
apt update && apt upgrade -y
apt install -y curl git ufw

# Node 20 via NodeSource or nvm
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Firewall: SSH + HTTP/S only
ufw allow OpenSSH
ufw allow 80,443/tcp
ufw enable

# Postgres (Docker one-liner — or apt install postgresql-16)
docker run -d --name aventer-db \
  -e POSTGRES_USER=aventer \
  -e POSTGRES_PASSWORD=<strong-password> \
  -e POSTGRES_DB=aventer \
  -v aventer-pg:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16

# Caddy (automatic HTTPS)
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

**Caddyfile** (`/etc/caddy/Caddyfile`):

```
api.aventer.dev {
    reverse_proxy localhost:3001
}
```

```bash
systemctl reload caddy
```

Create deploy user:

```bash
adduser --disabled-password --gecos "" aventer
mkdir -p /opt/aventer && chown aventer:aventer /opt/aventer
```

### Phase 2 — Database migrations (day 1–2)

1. Add migration tool (`drizzle-kit` or `node-pg-migrate`) to `services/api`
2. Run initial migration against VPS Postgres (or Neon)
3. Seed one beta project + API key

### Phase 3 — API + worker on VPS (day 2)

```bash
# As aventer user
cd /opt/aventer
git clone <repo-url> .
npm ci && npm run build

# Env file — restrict permissions
sudo mkdir -p /etc/aventer
sudo tee /etc/aventer/env <<EOF
DATABASE_URL=postgresql://aventer:<password>@localhost:5432/aventer
PORT=3001
NODE_ENV=production
AVENTER_BETA_API_KEY=<generate-strong-key>
EOF
sudo chmod 600 /etc/aventer/env
sudo chown aventer:aventer /etc/aventer/env
```

**systemd — API** (`/etc/systemd/system/aventer-api.service`):

```ini
[Unit]
Description=Aventer API
After=network.target docker.service

[Service]
Type=simple
User=aventer
WorkingDirectory=/opt/aventer/services/api
EnvironmentFile=/etc/aventer/env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**systemd — worker** (`/etc/systemd/system/aventer-worker.service`):

```ini
[Unit]
Description=Aventer delivery worker
After=aventer-api.service

[Service]
Type=simple
User=aventer
WorkingDirectory=/opt/aventer/services/worker
EnvironmentFile=/etc/aventer/env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aventer-api aventer-worker
curl https://api.aventer.dev/health
```

**Deploy script** (`/opt/aventer/deploy.sh`):

```bash
#!/bin/bash
set -euo pipefail
cd /opt/aventer
git pull origin main
npm ci
npm run build -w @aventer/schema
npm run build -w @aventer/api
npm run build -w @aventer/worker
sudo systemctl restart aventer-api aventer-worker
```

### Phase 4 — Dashboard to Vercel (day 2–3)

1. Import repo in Vercel
2. Root directory: `services/dashboard`
3. Build: `cd ../.. && npm ci && npm run build -w @aventer/dashboard`
4. Output directory: `dist`
5. Env: `VITE_API_URL=https://api.aventer.dev`
6. Custom domain: `beta.aventer.dev`
7. Test: connect with beta API key, run `examples/emit.ts` pointed at production API

### Phase 5 — Marketing to Vercel (day 3–4)

1. Minimal landing: value prop, `npm i @aventer/sdk`, link to beta signup
2. Domain: `aventer.dev`

### Phase 6 — Worker delivery logic (Phase 2 feature, week 2+)

1. Implement retry + DLQ in `services/worker`
2. Restart worker unit after deploy — same VPS, no new infrastructure

---

## 8. CI/CD

### GitHub Actions (monorepo)

```yaml
# .github/workflows/deploy.yml (sketch)
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npm run build
      - run: npm run typecheck

  # Optional: deploy API to Hetzner on push to main
  deploy-api:
    if: github.ref == 'refs/heads/main'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.HETZNER_HOST }}
          username: aventer
          key: ${{ secrets.HETZNER_SSH_KEY }}
          script: /opt/aventer/deploy.sh

  # Vercel auto-deploys on push via GitHub integration (dashboard + www)
```

- **Vercel:** Enable preview deployments for PRs (dashboard review apps)
- **Hetzner:** Manual `deploy.sh` or GitHub Actions SSH on merge to `main`
- **Neon:** Branch per PR only if using managed Postgres

---

## 9. Environment Variables

| Variable | Service | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | API, Worker | Yes | Postgres on VPS or Neon connection string |
| `PORT` | API | Yes | `3001` on Hetzner |
| `NODE_ENV` | All | Yes | `production` |
| `AVENTER_BETA_API_KEY` | API | Beta only | Single shared key until auth UI exists |
| `VITE_API_URL` | Dashboard | Yes | `https://api.aventer.dev` |
| `UPSTASH_REDIS_URL` | API | Later | Only if you split API across multiple VPS instances |

Store secrets in `/etc/aventer/env` on VPS and Vercel dashboard — not in git.

---

## 10. Observability (beta minimum)

| Need | Tool | Cost |
|---|---|---|
| API logs | `journalctl -u aventer-api -f` | Free |
| Error tracking | Sentry (optional) | Free tier |
| Uptime | Better Stack or UptimeRobot on `/health` | Free |
| Metrics | PostHog or Axiom on ingest/delivery counts | Free tier |
| VPS backups | Hetzner snapshots or `pg_dump` cron → object storage | ~€0.5/mo snapshots |

Defer Datadog/Grafana until post-beta.

---

## 11. Cost Estimate (beta, ~15 users)

| Service | Monthly |
|---|---|
| Vercel (Hobby) | $0 |
| Hetzner CX22 (API + worker + Postgres) | ~€4.5 (~$5) |
| Neon (only if not using VPS Postgres) | $0 free tier |
| Domain (aventer.dev) | already registered |
| **Total** | **~$5/mo** |

Railway/Fly equivalent: ~$15–40/mo. AWS App Runner + RDS: ~$40–80/mo minimum.

---

## 12. Security Checklist (pre-beta users)

- [ ] HTTPS everywhere; reject HTTP on API
- [ ] API keys hashed at rest (bcrypt or similar)
- [ ] Rate limit `POST /v1/events` per API key (e.g. 100 req/min)
- [ ] CORS restricted to `beta.aventer.dev`
- [ ] Subscriber URL validation (HTTPS only, block private IPs — SSRF prevention from strategy doc)
- [ ] UFW: only 22, 80, 443 open; Postgres bound to `127.0.0.1` only
- [ ] Unattended security upgrades enabled (`apt install unattended-upgrades`)

- [ ] Rotate beta API key if leaked; document rotation in README

---

## 13. Rollout Timeline

| Week | Milestone |
|---|---|
| 1 | Hetzner VPS + Postgres; API live at `api.aventer.dev` |
| 1 | Dashboard on Vercel; `beta.aventer.dev` live; end-to-end emit → SSE works |
| 2 | Landing on `aventer.dev`; invite first 3 design partners |
| 3–4 | Worker delivery + HMAC signing on same VPS |
| 5–8 | Beta cohort per prototype plan |

---

## 14. Decision

| Question | Recommendation |
|---|---|
| Vercel? | **Yes** — dashboard + marketing |
| Hetzner VPS? | **Yes** — API + worker + Postgres; cheap, SSE-friendly, matches your experience |
| Fly.io / Railway? | **Skip for beta** — cost and prior Fly egress experience |
| AWS? | **Defer** — revisit when beta metrics hit or enterprise asks |
| Database? | **Postgres on VPS** for beta; Neon optional |
| All-in-one? | **No** — Vercel frontend + Hetzner backend is the right split |

---

## 15. Immediate Next Steps

1. Add Postgres migration and replace `store.ts` in-memory implementation
2. Add CORS + `VITE_API_URL` to dashboard
3. Provision Hetzner CX22; bootstrap with Caddy + Postgres + systemd units
4. Point `api.aventer.dev` → VPS; deploy API → verify health → deploy dashboard on Vercel
5. Publish `@aventer/sdk` to npm with production API URL default

---

*This plan optimizes for shipping beta to AI engineers within a week: Vercel for what users see, Hetzner for what agents talk to — at ~$5/mo total.*
