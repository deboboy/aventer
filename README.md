# Aventer

Event layer for production AI agents — [aventer.dev](https://aventer.dev)

Aventer normalizes agent events into a canonical schema, delivers them reliably to your endpoints, and gives you a live view of what your agents are doing without opening an IDE.

## Monorepo layout

```
aventer/
├── packages/
│   ├── schema/     @aventer/schema   — agent-v1 types + JSON Schema
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

Default beta API key (local only): `avn_beta_dev_key_change_me`

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

## Domains

| Environment | URL |
|---|---|
| Marketing | `aventer.dev` |
| Beta API | `api.aventer.dev` |
| Beta dashboard | `beta.aventer.dev` |

Local dev uses `localhost:3001` (API) and `localhost:5173` (dashboard).

## Phase 1 status

- [x] `agent-v1` schema
- [x] Ingest API (`POST /v1/events`)
- [x] SDK `emit()`
- [x] CLI `init`, `login`, `listen`, `status`
- [x] Dashboard SSE live stream
- [ ] Delivery worker + HMAC signing
- [ ] Subscriber registry + `createHandler()`
- [ ] `aventer listen` tunnel to cloud

See `LastMyle/Content/Agents Events Webhooks/AEW_BETA_PROTOTYPE_PLAN.md` for the full beta plan.

## Environment variables

```bash
PORT=3001
AVENTER_BETA_API_KEY=avn_beta_dev_key_change_me
```

Copy `.env.example` to `.env` in `services/api/` for local overrides.
