# Session Summary — Aventer Beta Deploy

**Date:** Jul 8–9 2026  
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
| Beta auth | API + dashboard | JWT login + `/admin.html` | ✅ |
| TLS | Caddy + Vercel | Let's Encrypt | ✅ |

---

## What we built

### Monorepo (`~/LastMyle/Code/aventer`)

| Package | Purpose |
|---|---|
| `@aventer/schema` | `agent-v1` event types + Zod + JSON Schema |
| `@aventer/sdk` | `configure()`, `emit()` |
| `@aventer/cli` | `aventer init`, `login`, `listen`, `status` |
| `@aventer/delivery` | HMAC signing, retry schedule, URL validation |
| `@aventer/api` | Ingest, SSE, subscribers, delivery queue, auth |
| `@aventer/dashboard` | Live event viewer + login + admin UI |
| `@aventer/worker` | Outbound webhook delivery + retries + DLQ |

### Docs
- `~/LastMyle/Content/Agents Events Webhooks/AEW_BETA_PROTOTYPE_PLAN.md` — beta strategy
- `DEPLOYMENT_PLAN.md` — Vercel + Hetzner hybrid + DNS
- `BETA_AUTHENTICATION.md` / `BETA_TESTER_GUIDE.md` — dashboard auth (PR #1)

---

## Session timeline

### Jul 8 — deploy + delivery worker

- Scaffolded monorepo; Vercel dashboard (`services/dashboard`), Hetzner API + Caddy
- Fixed SSE 404, CORS for EventSource, Postgres on VPS
- Delivery worker + Last Myle webhook E2E — **passed**
- Repo moved to `~/LastMyle/Code/aventer`
- Worker observability patch (`attempt_count`, `last_status_code` on success) — deployed VPS

### Jul 9 — beta auth + custom domain

**Beta authentication (PR #1, merged `5db08c0`):**
- `beta_users` table, JWT login, admin CRUD, dashboard login gate
- Deploy requires `JWT_SECRET` on VPS + **`aventer-api` restart** (not worker alone)
- Default admin password changed via `PUT /v1/admin/users/usr_admin_default/password`

**Custom domain fix (`aventer.dev` apex):**
- `www.aventer.dev` worked; apex showed Vercel **Invalid Configuration**
- Vercel flagged conflicting A `@` → `162.255.119.161` — **not visible** in Namecheap Advanced DNS
- Root cause: **URL Redirect Record** on `@` → `http://www.aventer.dev/` injects a hidden Namecheap forwarding A record
- Fix: delete URL Redirect on `@`; keep A `@` → `216.198.79.1`; redirect apex ↔ www in **Vercel Domains** only
- Documented in `DEPLOYMENT_PLAN.md` §5

---

## Worker E2E test (Jul 8) — passed

**Flow:** `npm run emit` → API → Postgres → worker → signed POST → Last Myle → `200`

| Step | Result |
|---|---|
| Delivery | `delivered`, `attempt_count: 1`, `last_status_code: 200` |

**Issues fixed along the way:**
1. Amplify `AVENTER_WEBHOOK_SECRET` missing from `amplify.yml` (`lastmyle-nextjs` `e4ef7b1`)
2. Subscriber secret mismatch — re-registered with Amplify value
3. Delivery observability null fields on first-try success — worker patch `91a5dbc`

---

## VPS ops cheat sheet

```bash
# Deploy API + worker (auth changes need build:api + aventer-api restart)
sudo -u aventer git -C /opt/aventer pull origin main
sudo -u aventer bash -lc 'cd /opt/aventer && npm ci && npm run build:api && npm run build:worker'
sudo systemctl restart aventer-api aventer-worker

# Health
curl -s https://api.aventer.dev/health

# Auth smoke test
curl -s -X POST https://api.aventer.dev/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}'
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
JWT_SECRET=<openssl rand -base64 32>
AVENTER_API_URL=https://api.aventer.dev
DATABASE_URL=postgresql://aventer:<password>@localhost:5432/aventer
```

**Vercel (dashboard):** `VITE_API_URL=https://api.aventer.dev`

**Last Myle Amplify:** `AVENTER_WEBHOOK_SECRET` (+ echo in `amplify.yml`)

---

## DNS (Namecheap → Vercel)

| Host | Type | Value |
|---|---|---|
| `@` | A | `216.198.79.1` |
| `www` | CNAME | `<project>.vercel-dns-017.com` |
| `api` | A | Hetzner VPS IP |

**Do not** use Namecheap URL Redirect on `@` — it breaks apex verification.

---

## Next up

- [x] Deploy worker to VPS + register first subscriber
- [x] E2E webhook delivery to Last Myle production
- [x] Deploy worker observability patch to VPS
- [x] Beta dashboard authentication
- [x] Apex domain `aventer.dev` on Vercel
- [ ] SDK `createHandler()` for subscribe-side verification
- [ ] `aventer listen` tunnel
- [ ] Publish `@aventer/sdk` to npm
- [ ] Marketing landing (separate from dashboard)
- [ ] Last Myle webhook side effects (Slack, CRM) after idempotency
- [ ] Password-change UI in admin dashboard (API works today)
