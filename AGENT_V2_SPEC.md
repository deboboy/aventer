# Agent Observability Landscape & agent-v2 Spec

**Date:** Jul 9 2026  
**Status:** Draft — strategic direction + schema proposal  
**Audience:** Aventer engineering, beta design partners  
**Related:** [README](./README.md) · [SESSION_SUMMARY](./SESSION_SUMMARY.md) · [agent-v1.schema.json](./packages/schema/agent-v1.schema.json)

---

## 1. Executive summary

Research from Jul 2026 (Hermes agent, community sources) confirms that AI agent observability is consolidating around **OpenTelemetry GenAI conventions** for traces, while **correctness** and **guardrails** remain underserved. Cost and latency dashboards ship first; judging whether an agent actually completed work correctly is the harder second wave.

**Aventer should not compete with OTel backends.** It should complement them: a thin **outcome event + delivery layer** that answers *“something happened my production systems must react to”* — not *“here are 200 spans.”*

This document captures that analysis and proposes **`agent-v2`**: run-level semantics, structured correctness/cost signals, guardrail events, and an OTel bridge — all delivered via the existing ingest → Postgres → SSE → webhook pipeline.

---

## 2. What the research found

### 2.1 OTel GenAI is the de facto standard

The field is consolidating around OpenTelemetry as the standard. The OpenTelemetry GenAI semantic conventions (`gen_ai.*` spans) are now versioned and citable. The 2026 vendor consolidation means agent traces land in standard OTel backends instead of proprietary dashboards.

Cloudflare merged native AI tracing into its agents SDK (PR #1860, July 2026) using OTel GenAI conventions flowing to Workers Observability and OTLP destinations. A year ago every vendor shipped its own agent dashboard; now the five OTel agent spans are becoming the lingua franca.

**Implication for Aventer:** Trace storage and span UI are commoditized. Competing on raw traces is a losing bet. Complementing OTel with outcome events is viable.

### 2.2 Token cost and latency are necessary but not sufficient

> "Your AI agent can return 200 OK, meet latency and cost targets, and still be wrong."

Cost dashboards tell you what you spent, not whether the task was completed correctly. That is the exact gap every team hits: **cost observability ships first; correctness observability is the harder second wave** built on trace-based correctness signals.

**Implication for Aventer:** `task.completed` with tokens alone is table stakes. Structured **correctness** fields on completion events are differentiation.

### 2.3 Trace-based correctness needs aggregation, not raw spans

Agent tracing (span trees, run trees) surfaces every tool call and decision. The catch: a raw span tree is **practically useless at 200 decisions** — you need aggregation and ranking, not raw spans, to judge improvement over time.

The maturity curve:

```
cost dashboards  →  traces  →  ranked / correctness signals
    (solved)          (OTel)         (still open)
```

**Implication for Aventer:** Run-level events with ranked/aggregated semantics sit above traces. Aventer emits *judgments* and *outcomes*, not span dumps.

### 2.4 Unbounded spend is a live failure mode

Community reports include agents that "bankrupted their operator" via unbounded token and action spend with no kill switch or cost ceiling. The monitoring gap is not theoretical: agents that loop or run amok incur real money before anyone notices.

**Implication for Aventer:** Guardrail events (`budget.exceeded`, `loop.detected`) with webhook delivery to kill-switch endpoints are product, not documentation.

### 2.5 The adoption barrier is shifting

Native platform tracing (Cloudflare Workers, AI gateways) plus OTel convergence means companies no longer need custom observability plumbing before adopting agents. The barrier moved from *"can we even see what the agent did?"* to *"can we set a cost ceiling and a correctness check?"* — both increasingly solvable with off-the-shelf OTel tooling.

**Implication for Aventer:** Low-friction `emit()` + webhooks to systems teams already run (Slack, CRM, custom APIs) matches the new barrier. Additive to OTel, not a replacement.

### 2.6 Key patterns (summary)

| Pattern | Status |
|---|---|
| OTel GenAI conventions (`gen_ai.*`) | De facto standard — Cloudflare, Gravitee, MLflow converged |
| Cost + latency dashboards | Exist today; commoditized |
| Correctness tracing | Lagging, harder problem — opportunity |
| First-party platform tracing | Lowers input requirement for agent adoption |
| Biggest failure mode | Unbounded spend — gap is **automated guardrails**, not dashboards |

---

## 3. Where Aventer fits

Aventer today is a thin **event + delivery layer**: `agent-v1` events → Postgres → SSE dashboard → signed webhooks. That is closer to Stripe webhooks or Segment than Datadog.

| Layer | Who owns it | Aventer role |
|---|---|---|
| Span trees, `gen_ai.*` | OTel → Honeycomb / Datadog / Workers Observability | Optional **bridge**, not replacement |
| Cost / token / latency | OTel + billing | **Consume** summaries; don't rebuild APM |
| Business outcomes | Under-served | **Own** — `task.completed`, `task.failed`, webhooks to Slack / CRM |
| Guardrails | Under-served | **Own** — `budget.exceeded`, kill-switch events, subscriber reactions |

### Strategic principles

1. **Don't compete with OTel — complement it.** An OTel exporter that emits Aventer events from GenAI spans is high leverage.
2. **Correctness is differentiation, not traces.** Distill trace-based correctness into structured event fields.
3. **Guardrails are product.** Budget and loop events with webhook-triggered kill switches use the same delivery pipe as task events.
4. **Stay additive.** Teams keep their OTel stack; Aventer is the outbound nerve system for agent outcomes.

### What to avoid

- Building a proprietary trace viewer (OTel backends win on depth)
- Chasing every `gen_ai.*` field in v1 (map a thin subset instead)
- Optimizing for token dashboards alone (commoditized)

### What to build next

1. **`agent-v2`** — structured `data` conventions (see §5)
2. **OTel → Aventer bridge** — SDK middleware or Collector exporter (see §6)
3. **Run summary API** — `GET /v1/runs/:run_id` aggregated from events (see §7)
4. **Guardrail event types** — budget / loop / cancel with subscriber docs (see §5.3)

---

## 4. agent-v1 baseline

Current schema (`packages/schema/agent-v1.schema.json`):

**Event types:** `task.started`, `task.completed`, `task.failed`, `tool.called`, `tool.failed`, `agent.started`, `agent.stopped`, `llm.error`

**Context (optional):** `parent_id`, `step`, `framework`

**Data:** unconstrained `Record<string, unknown>` — e.g. `{ task_id, tokens }` in examples

**Gaps for observability maturity:**

- No standard fields for cost, latency, or correctness
- No guardrail events
- No OTel correlation (`trace_id`, `span_id`)
- Run-level aggregation requires client-side assembly

`agent-v2` extends v1 **additively**. v1 events remain valid indefinitely.

---

## 5. agent-v2 specification (draft)

### 5.1 Design goals

- **Backward compatible** — `spec_version: "agent-v2"` with v1 types still accepted
- **Run-level first** — events describe outcomes and decisions, not every span
- **OTel-friendly** — optional correlation to `trace_id` / `span_id`
- **Subscriber-ready** — structured fields for webhook filters and alerting
- **Minimal required fields** — conventions documented; validation lenient in beta

### 5.2 Envelope changes

```json
{
  "spec_version": "agent-v2",
  "id": "evt_abc123",
  "type": "task.completed",
  "timestamp": "2026-07-09T23:00:00.000Z",
  "run_id": "run_xyz",
  "agent_id": "my-agent",
  "org_id": "org_123",
  "data": { },
  "context": {
    "parent_id": "evt_parent",
    "step": 3,
    "framework": "langchain",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id": "00f067aa0ba902b7"
  }
}
```

**New optional `context` fields:**

| Field | Type | Description |
|---|---|---|
| `trace_id` | string | W3C trace ID from OTel (32 hex chars) |
| `span_id` | string | OTel span ID for the emitting operation |
| `environment` | string | `production`, `staging`, `development` |

### 5.3 Event types

#### Carried forward from v1 (unchanged semantics)

| Type | When |
|---|---|
| `task.started` | Run or sub-task begins |
| `task.completed` | Run or sub-task finished successfully |
| `task.failed` | Run or sub-task failed |
| `tool.called` | Tool invocation (success path) |
| `tool.failed` | Tool invocation failed |
| `agent.started` | Agent process/session started |
| `agent.stopped` | Agent process/session stopped |
| `llm.error` | LLM provider error |

#### New in v2 — guardrails

| Type | When | Typical subscriber action |
|---|---|---|
| `budget.warning` | Spend crosses soft threshold (e.g. 80%) | Slack notify |
| `budget.exceeded` | Hard cost ceiling hit | Kill switch, disable agent |
| `loop.detected` | Same tool/step repeated N times | Cancel run, page on-call |
| `run.cancelled` | Run aborted by guardrail or operator | Audit log, CRM note |

#### New in v2 — correctness

| Type | When | Typical subscriber action |
|---|---|---|
| `task.verified` | Post-hoc correctness check passed | Close ticket, mark success |
| `task.rejected` | Correctness check failed (agent returned 200 but wrong) | Alert, retry, human review |

`task.verified` / `task.rejected` separate **operational success** (`task.completed`) from **correctness success** — addressing the "200 OK but wrong" problem.

### 5.4 Standard `data` conventions

All fields optional unless noted. Subscribers should tolerate missing fields.

#### Task events (`task.*`)

```json
{
  "task_id": "task_abc",
  "summary": "Generated Q3 report",
  "duration_ms": 4200,
  "tokens": {
    "input": 1200,
    "output": 800,
    "total": 2000
  },
  "cost_usd": 0.042,
  "correctness": "verified",
  "correctness_score": 0.95,
  "correctness_source": "evaluator-v1",
  "error_code": null,
  "error_message": null
}
```

| Field | Type | Description |
|---|---|---|
| `task_id` | string | Stable id within the run |
| `summary` | string | Human-readable one-liner |
| `duration_ms` | number | Wall-clock for this task |
| `tokens.input` | number | Prompt tokens |
| `tokens.output` | number | Completion tokens |
| `tokens.total` | number | Sum |
| `cost_usd` | number | Estimated spend in USD |
| `correctness` | enum | `verified` \| `unknown` \| `failed` |
| `correctness_score` | number | 0.0–1.0 when scored |
| `correctness_source` | string | Who judged (evaluator name, human, rule) |
| `error_code` | string | Machine-readable failure code |
| `error_message` | string | Human-readable failure detail |

**`correctness` enum:**

| Value | Meaning |
|---|---|
| `verified` | Outcome confirmed correct |
| `unknown` | Completed but not yet judged (default for bare `task.completed`) |
| `failed` | Judged incorrect despite possible HTTP/LLM success |

#### Tool events (`tool.*`)

```json
{
  "tool_name": "search_web",
  "tool_call_id": "call_abc",
  "duration_ms": 320,
  "input_summary": "query: DN42 routing table",
  "output_summary": "12 results",
  "tokens": { "total": 450 },
  "cost_usd": 0.001
}
```

#### Guardrail events (`budget.*`, `loop.*`, `run.cancelled`)

```json
{
  "threshold_usd": 10.00,
  "current_usd": 10.42,
  "period": "run",
  "action_taken": "cancelled",
  "loop_count": 47,
  "loop_pattern": "tool:dns_lookup",
  "reason": "Exceeded max_iterations"
}
```

### 5.5 JSON Schema sketch

Full schema TBD in `packages/schema/agent-v2.schema.json`. Core constraints:

```json
{
  "spec_version": { "const": "agent-v2" },
  "type": {
    "enum": [
      "task.started", "task.completed", "task.failed",
      "task.verified", "task.rejected",
      "tool.called", "tool.failed",
      "agent.started", "agent.stopped",
      "llm.error",
      "budget.warning", "budget.exceeded",
      "loop.detected", "run.cancelled"
    ]
  }
}
```

API ingest accepts both `agent-v1` and `agent-v2` during transition. Dashboard and subscribers filter by `type` as today.

### 5.6 Subscriber filter examples

```json
{
  "url": "https://www.lastmyle.co/api/webhooks/aventer",
  "secret": "whsec_...",
  "event_types": ["task.failed", "task.rejected", "budget.exceeded", "loop.detected"]
}
```

Alert on correctness failures and runaway spend; ignore routine `task.completed` with `correctness: unknown`.

Future: filter expressions on `data.correctness`, `data.cost_usd` (post-beta).

---

## 6. OTel bridge (design)

### 6.1 Goal

Let teams keep OTel as source of truth while Aventer delivers outcomes to business systems.

```
Agent runtime
    │
    ├── OTel SDK ──► OTLP ──► Honeycomb / Datadog / Workers Observability
    │
    └── Aventer bridge ──► POST /v1/events ──► webhooks / SSE dashboard
```

### 6.2 Span → event mapping

| OTel GenAI span | Aventer event | Notes |
|---|---|---|
| `gen_ai.client.chat` (final) | `task.completed` | Aggregate tokens/cost from span attributes |
| `gen_ai.client.chat` (error) | `llm.error` | Map `error.type`, `error.message` |
| `gen_ai.tool.call` (ok) | `tool.called` | `tool_name` from attributes |
| `gen_ai.tool.call` (error) | `tool.failed` | |
| Custom: budget checker | `budget.warning` / `budget.exceeded` | App-emitted or bridge rule |
| Custom: loop detector | `loop.detected` | Bridge aggregates repeated tool spans |

### 6.3 Bridge implementation options

| Option | Pros | Cons |
|---|---|---|
| **SDK middleware** (`@aventer/sdk` + OTel hook) | Simple for Node agents | Language-specific |
| **OTel Collector processor** | Language-agnostic, central | Ops overhead |
| **Periodic aggregator** | Batches spans → one `task.completed` | Latency |

**Recommended for beta:** SDK middleware in TypeScript — on run end, read root span attributes and emit one `task.completed` with aggregated `tokens`, `cost_usd`, `duration_ms`.

### 6.4 Correlation

Bridge copies `trace_id` and `span_id` into `context` so subscribers can deep-link to OTel UI:

```json
{
  "context": {
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id": "00f067aa0ba902b7",
    "framework": "cloudflare-agents"
  }
}
```

---

## 7. Run summary API (design)

Raw events are sufficient for beta; v2 adds aggregation for correctness-over-time without span trees.

### `GET /v1/runs/:run_id`

Returns all events for a run, plus computed summary:

```json
{
  "run_id": "run_xyz",
  "agent_id": "my-agent",
  "status": "completed",
  "started_at": "2026-07-09T22:59:00.000Z",
  "completed_at": "2026-07-09T23:00:04.200Z",
  "duration_ms": 4200,
  "event_count": 12,
  "tokens": { "input": 5200, "output": 2100, "total": 7300 },
  "cost_usd": 0.087,
  "correctness": "verified",
  "tool_calls": 8,
  "errors": 0,
  "events": [ ]
}
```

**`status` derivation:**

| Condition | Status |
|---|---|
| Has `task.failed` or `task.rejected` | `failed` |
| Has `budget.exceeded` or `run.cancelled` | `cancelled` |
| Has `task.completed` or `task.verified` | `completed` |
| Has `task.started` only | `running` |
| Otherwise | `unknown` |

Enables "are they improving over time?" via periodic queries on `correctness` and `cost_usd` per run — not 200-span trees.

---

## 8. Implementation roadmap

| Phase | Scope | Depends on |
|---|---|---|
| **2a** | Document v2 conventions; accept `agent-v2` in ingest (lenient validation) | — |
| **2b** | Extend `@aventer/schema` + SDK `emit()` for v2 types | 2a |
| **2c** | `GET /v1/runs/:run_id` summary | Postgres events table |
| **2d** | OTel bridge (TypeScript middleware) | 2b |
| **2e** | Dashboard: run summary + correctness badges | 2c |
| **2f** | Subscriber filters on `data.correctness` | API + docs |

Guardrail events (`budget.*`, `loop.*`) can ship in **2b** with manual `emit()` before automated detection lands.

---

## 9. Success metrics (beta)

| Metric | Target |
|---|---|
| % runs with `correctness` set (not `unknown`) | > 50% among design partners |
| Guardrail events → webhook → action (kill switch) | ≥ 1 partner wired |
| OTel bridge adoption | ≥ 1 partner using middleware |
| Mean time to wire first subscriber | < 30 minutes (unchanged from v1) |

---

## 10. References

- OpenTelemetry GenAI semantic conventions — `gen_ai.*` spans
- Cloudflare agents SDK PR #1860 (July 2026) — native OTel AI tracing
- Community: HN unbounded agent spend / DN42 bankruptcy thread
- @hackernoon — "200 OK but wrong" correctness gap
- morphllm agent-tracing guide — span tree aggregation at scale

---

## Appendix A: v1 → v2 migration for emitters

```typescript
// v1 (still supported)
await emit("task.completed", { task_id: "123", tokens: 4200 });

// v2 (recommended)
await emit("task.completed", {
  task_id: "123",
  duration_ms: 4200,
  tokens: { input: 3000, output: 1200, total: 4200 },
  cost_usd: 0.042,
  correctness: "unknown",
});
```

No breaking changes. Set `spec_version: "agent-v2"` when SDK supports it (default for new SDK versions).

## Appendix B: Example guardrail wiring

```typescript
// In agent loop — after detecting repeated tool call
await emit("loop.detected", {
  loop_count: 50,
  loop_pattern: "tool:dns_lookup",
  current_usd: 12.40,
  reason: "max_iterations exceeded",
});

// Subscriber POSTs to your kill-switch API
// POST https://your-app.com/api/agents/kill-switch
// → disables agent, stops billing
```
