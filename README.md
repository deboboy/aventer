# Aventer

Event layer for production AI agents — [aventer.dev](https://aventer.dev)

Aventer normalizes agent events into a canonical schema, delivers them reliably to your endpoints, and gives you a live view of what your agents are doing without opening an IDE.

## Monorepo layout

```
aventer/
├── packages/
│   ├── schema/     @aventer/schema   — agent-v1 types + JSON Schema
│   ├── delivery/   @aventer/delivery — signing, retries, URL validation
│   ├── sdk/        @aventer/sdk      — emit(), configure()
│   └── cli/        @aventer/cli      — aventer init | login | listen
├── services/
│   ├── api/        Ingest API + SSE live stream
│   ├── worker/     Delivery + retry + DLQ (Phase 2)
│   └── dashboard/  Live event viewer (beta)
└── examples/
```

## Quick start (local)

```bash
npm install
npm run build

# Terminal 1 — API
npm run dev:api

# Terminal 2 — dashboard
npm run dev:dashboard

# Terminal 3 — configure + emit
cd examples
npx tsx emit.ts
```

**Beta authentication is now enabled!**

Default login credentials:
- Username: `admin`
- Password: `changeme123`

⚠️ **Change the default password in production immediately** (see below). Full docs: [BETA_AUTHENTICATION.md](./docs/BETA_AUTHENTICATION.md)

### Change the default admin password

There is no password-change UI yet — use the API:

```bash
# 1. Get an admin token
TOKEN=$(curl -s -X POST https://api.aventer.dev/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme123"}' \
  | jq -r '.token')

# 2. Set a new password (default admin id: usr_admin_default)
curl -s -X PUT https://api.aventer.dev/v1/admin/users/usr_admin_default/password \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_NEW_STRONG_PASSWORD"}'
```

Expect `{"updated":true}`. Log out of the dashboard and sign in with your new password.

To look up a user id: `curl -s -H "Authorization: Bearer $TOKEN" https://api.aventer.dev/v1/admin/users | jq`

Alternative: create a new admin at `/admin.html`, log in as that user, then delete the default `admin` account. See [BETA_TESTER_GUIDE.md](./docs/BETA_TESTER_GUIDE.md).

For SDK/API access, use the default beta API key (local only): `avn_beta_dev_key_change_me`

Set `AVENTER_API_KEY` or use:

```bash
npx aventer login --api-key avn_beta_dev_key_change_me
npx aventer init --api-url http://localhost:3001
```

## Emit from your agent

```typescript
import { configure, emit } from "@aventer/sdk";

configure({
  apiKey: process.env.AVENTER_API_KEY,
  apiUrl: process.env.AVENTER_API_URL ?? "http://localhost:3001",
  agentId: "my-agent",
});

await emit("task.started", { task_id: "123" });
// ... agent work ...
await emit("task.completed", { task_id: "123", tokens: 4200 });
```

**agent-v2** (recommended): structured cost/correctness fields, guardrail events, `verify()` for eval pipeline. See [`docs/AGENT_V2_SPEC.md`](./docs/AGENT_V2_SPEC.md).

```typescript
import { configure, emit, verify } from "@aventer/sdk";

await emit("task.completed", {
  task_id: "123",
  tokens: { input: 3000, output: 1200, total: 4200 },
  cost_usd: 0.042,
  correctness: "unknown",
});

await verify({
  task_id: "123",
  evaluator: "golden-set-v1",
  evaluator_type: "golden_set",
  score: 0.95,
  verdict: "pass",
});
```

```bash
npm run emit:v2   # example v2 flow with verify()
```

Fetch run summary: `GET /v1/runs/:run_id`

## Domains

| Environment | URL |
|---|---|
| Marketing | `aventer.dev` |
| Beta API | `api.aventer.dev` |
| Beta dashboard | `beta.aventer.dev` |

Local dev uses `localhost:3001` (API) and `localhost:5173` (dashboard).

## Deploy dashboard to Vercel

**Only deploy the dashboard on Vercel** — the API runs on Hetzner (see [DEPLOYMENT_PLAN.md](./docs/DEPLOYMENT_PLAN.md)).

### Vercel project settings

| Setting | Value |
|---|---|
| **Root Directory** | **`services/dashboard`** |
| Framework Preset | Other (or leave as detected; `vercel.json` overrides build) |
| Build Command | *(from `services/dashboard/vercel.json`)* `cd ../.. && npm run build:dashboard` |
| Output Directory | `dist` |
| Install Command | *(from `services/dashboard/vercel.json`)* `cd ../.. && npm ci` |

**Use `services/dashboard` as Root Directory.** Vercel defaults to the repo root or may detect `services/api`; either causes a failed build (`Cannot find module '@aventer/schema'`) because the API is not a Vercel target.

Do **not** set Root Directory to:

- `.` (repo root) — unless you prefer the root `vercel.json`; `services/dashboard` is simpler
- `services/api` — backend service; deploy on Hetzner instead

### Environment variables

| Name | Value |
|---|---|
| `VITE_API_URL` | `https://api.aventer.dev` |

Also set in `services/dashboard/vercel.json` for builds. Production builds default to `https://api.aventer.dev` if unset. Without this, the dashboard calls `/v1/events/stream` on Vercel (404) instead of the API.

Required in production so the dashboard SSE client talks to your API host (local dev uses the Vite proxy when this is unset).

### Custom domain

- `beta.aventer.dev` → this Vercel project

### Setup checklist

1. Import [github.com/deboboy/aventer](https://github.com/deboboy/aventer) in Vercel
2. **Project Settings → General → Root Directory** → set to `services/dashboard` → Save
3. **Project Settings → Environment Variables** → add `VITE_API_URL`
4. Redeploy

## Phase 1 status

- [x] `agent-v1` schema
- [x] Ingest API (`POST /v1/events`)
- [x] SDK `emit()`
- [x] CLI `init`, `login`, `listen`, `status`
- [x] Dashboard SSE live stream
- [x] Postgres event persistence
- [x] Delivery worker + HMAC signing + DLQ
- [x] Subscriber registry API
- [x] **Beta authentication + admin dashboard**
- [ ] SDK `createHandler()` for subscribers
- [ ] `aventer listen` tunnel to cloud

See `~/LastMyle/Content/Agents Events Webhooks/AEW_BETA_PROTOTYPE_PLAN.md` for the full beta plan.

**Local clone:** `~/LastMyle/Code/aventer`

## Postgres

### Local dev

```bash
docker compose up -d
cp services/api/.env.example services/api/.env
# or add DATABASE_URL to repo .env.local

npm run build:api
DATABASE_URL=postgresql://aventer:aventer@localhost:5432/aventer npm run dev:api
curl -s http://localhost:3001/health
# {"status":"ok","service":"aventer-api","db":"connected"}
```

### Hetzner VPS

On the VPS as **root** (from a fresh clone or after `git pull`):

```bash
cd /opt/aventer
chmod +x scripts/postgres-vps-setup.sh
./scripts/postgres-vps-setup.sh
```

The script prints a `DATABASE_URL` — add it to `/etc/aventer/env`:

```bash
sudo nano /etc/aventer/env
```

```bash
DATABASE_URL=postgresql://aventer:<password>@localhost:5432/aventer
```

Deploy API code and restart:

```bash
sudo -u aventer git -C /opt/aventer pull origin main
sudo -u aventer bash -lc 'cd /opt/aventer && npm ci && npm run build:api'
sudo systemctl restart aventer-api
curl -s https://api.aventer.dev/health
# expect "db":"connected"
```

Migrations run automatically on API startup. Manual run: `npm run db:migrate -w @aventer/api` (after build).

## Delivery worker

Outbound webhooks: when events are ingested, matching subscribers get queued deliveries. The worker POSTs signed payloads with retries (6 attempts) then DLQ.

### Register a subscriber

```bash
curl -s -X POST https://api.aventer.dev/v1/subscribers \
  -H "Authorization: Bearer $AVENTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/aventer",
    "secret": "whsec_your_secret",
    "event_types": ["task.completed", "task.failed"]
  }'
```

Omit `event_types` (or `[]`) to receive all events. URLs must be **HTTPS** (no private IPs).

### Local webhook test

```bash
# Terminal 1
WEBHOOK_SECRET=whsec_test node examples/webhook-receiver.mjs 4000

# Terminal 2 — register (use ngrok/cloudflared URL in production test)
curl -X POST http://localhost:3001/v1/subscribers \
  -H "Authorization: Bearer avn_beta_dev_key_change_me" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://YOUR_TUNNEL/webhook","secret":"whsec_test"}'

# Terminal 3
npm run emit
```

### Hetzner worker systemd

```bash
sudo cp /opt/aventer/scripts/aventer-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now aventer-worker
sudo systemctl status aventer-worker
```

Deploy: `npm run build:worker` then `systemctl restart aventer-worker`.

### Delivery observability

```bash
curl -s -H "Authorization: Bearer $AVENTER_API_KEY" \
  "https://api.aventer.dev/v1/deliveries?status=dlq"

curl -s -X POST -H "Authorization: Bearer $AVENTER_API_KEY" \
  "https://api.aventer.dev/v1/deliveries/del_xxx/replay"
```

## Environment variables

**API (`/etc/aventer/env` on VPS, or `services/api/.env` locally):**

```bash
PORT=3001
NODE_ENV=production
AVENTER_BETA_API_KEY=avn_beta_<secret>
JWT_SECRET=<openssl rand -base64 32>
DATABASE_URL=postgresql://aventer:<password>@localhost:5432/aventer
```

Without `DATABASE_URL`, the API falls back to in-memory storage (events lost on restart).

Copy `services/api/.env.example` for local overrides.
