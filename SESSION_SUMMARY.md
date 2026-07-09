# Session Summary — Aventer Beta Deploy

**Date:** Wed Jul 8 2026  
**Goal:** Prototype and deploy Aventer (Agents Events Webhooks) — thin platform + CLI + SDK for AI engineer beta.  
**Repo:** https://github.com/deboboy/aventer  
**Domain:** aventer.dev  
**Local clone:** `~/LastMyle/Code/aventer`

---

## Production stack (live)

| Surface | Host | URL | Status |
|---|---|---|---|
| Dashboard | Vercel | `aventer.dev` / `www.aventer.dev` | ✅ |
| API + SSE | Hetzner VPS | `api.aventer.dev` (91.98.115.123) | ✅ |
| Postgres 16 | Docker on VPS | `localhost:5432` | ✅ |
| Delivery worker | Hetzner VPS (systemd) | internal | ✅ |
| TLS | Caddy | Let's Encrypt | ✅ |

---

## What we built

### Monorepo (`~/LastMyle/Code/aventer`)

| Package | Purpose |
|---|---|
| `@aventer/schema` | `agent-v1` event types + Zod + JSON Schema |
| `@aventer/sdk` | `configure()`, `emit()` |
| `@aventer/cli` | `aventer init`, `login`, `listen`, `status` |
| `@aventer/delivery` | HMAC signing, retry schedule, URL validation |
| `@aventer/api` | Ingest, SSE, subscribers, delivery queue API |
| `@aventer/dashboard` | Vite live event viewer |
| `@aventer/worker` | Outbound webhook delivery + retries + DLQ |

### Docs
- `~/LastMyle/Content/Agents Events Webhooks/AEW_BETA_PROTOTYPE_PLAN.md` — beta strategy
- `DEPLOYMENT_PLAN.md` — Vercel + Hetzner hybrid

---

## Session timeline (Jul 8)

### Morning — deploy
- Scaffolded monorepo, pushed to `github.com/deboboy/aventer`
- Vercel dashboard: **Root Directory = `services/dashboard`**, `VITE_API_URL=https://api.aventer.dev`
- Hetzner VPS: Caddy → Node API on `:3001`, systemd `aventer-api.service`

### Afternoon — production hardening
- Fixed SSE 404 (relative API URL in dashboard)
- Fixed CORS for EventSource (headers before stream start, commit `71452ca`)
- Postgres on VPS via `scripts/postgres-vps-setup.sh` — `"db":"connected"`
- Unified `AVENTER_API_KEY` / `AVENTER_BETA_API_KEY` + `npm run emit` with `.env.local`
- **Verified end-to-end:** emit → API → Postgres → SSE → dashboard

### Evening — delivery worker + Last Myle webhook test
- `@aventer/delivery` package: HMAC-SHA256, 6-attempt retry schedule, HTTPS-only subscriber URLs
- Migration `002_delivery.sql`: `subscribers`, `deliveries` (with DLQ status)
- API: `POST/GET/DELETE /v1/subscribers`, `GET /v1/deliveries`, `POST /v1/deliveries/:id/replay`
- Worker: polls queue, signs payloads (`X-Aventer-Signature`), retries, DLQ
- Last Myle webhook: `POST https://www.lastmyle.co/api/webhooks/aventer` (log-only handler)
- Moved repo to `~/LastMyle/Code/aventer`; updated README paths

### Worker E2E test (Jul 8 evening) — **passed**

**Flow verified:** `npm run emit` → Aventer API → Postgres → worker → signed POST → Last Myle → `200`

| Step | Result |
|---|---|
| API health | `{"status":"ok","db":"connected"}` |
| Subscriber | `https://www.lastmyle.co/api/webhooks/aventer` registered |
| Emit | `task.completed` ingested |
| Delivery | `delivered` in ~1.1s |

**Issues found and fixed:**

1. **Amplify env not reaching SSR** — `AVENTER_WEBHOOK_SECRET` was in the Amplify console but missing from `amplify.yml` (this app bakes vars into `.env.production` at build). Fixed in `lastmyle-nextjs` commit `e4ef7b1`. Symptom: HTTP 503 → 401 after redeploy.
2. **Subscriber secret mismatch** — test subscriber registered with a random secret; re-registered with Amplify-matching secret.
3. **Delivery observability gap** — successful first-try deliveries left `attempt_count` and `last_status_code` null in `/v1/deliveries`. Patched worker to record both on success.

**Related repos:**
- `Last-Myle/lastmyle-nextjs` — webhook handler, `docs/AVENTER_WEBHOOK.md`, `amplify.yml` fix
- `scripts/worker-e2e-test.mjs` — local E2E test helper

---

## VPS ops cheat sheet

```bash
# Deploy API + worker
sudo -u aventer git -C /opt/aventer pull origin main
sudo -u aventer bash -lc 'cd /opt/aventer && npm ci && npm run build:api && npm run build:worker'
sudo systemctl restart aventer-api aventer-worker

# Health
curl -s https://api.aventer.dev/health

# Deliveries
curl -s -H "Authorization: Bearer $AVENTER_API_KEY" \
  "https://api.aventer.dev/v1/deliveries?limit=5"
```

**Env file:** `/etc/aventer/env`  
**Git:** always use `sudo -u aventer` (ownership)

---

## Key env vars

**Aventer VPS / local `.env.local`:**

```bash
PORT=3001
NODE_ENV=production
AVENTER_BETA_API_KEY=avn_beta_<secret>
AVENTER_API_URL=https://api.aventer.dev
DATABASE_URL=postgresql://aventer:<password>@localhost:5432/aventer
```

**Last Myle Amplify:**

```bash
AVENTER_WEBHOOK_SECRET=<shared-secret>   # must match subscriber secret in Aventer
```

Also add to `lastmyle-nextjs/amplify.yml` echo block (required for SSR on this app).

**Vercel (dashboard):** `VITE_API_URL=https://api.aventer.dev`

---

## Next up

- [x] Deploy worker to VPS + register first subscriber
- [x] E2E webhook delivery to Last Myle production
- [ ] Deploy worker observability patch to VPS
- [ ] SDK `createHandler()` for subscribe-side verification
- [ ] `aventer listen` tunnel
- [ ] Publish `@aventer/sdk` to npm
- [ ] Marketing landing (dashboard currently on apex domain)
- [ ] Last Myle webhook side effects (Slack, CRM) after idempotency
