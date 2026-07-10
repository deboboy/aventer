import type { CorrectnessStatus } from "@aventer/schema";
import type { StoredEvent } from "./types.js";

export type RunStatus = "completed" | "failed" | "cancelled" | "running" | "unknown";

export type RunTokenSummary = {
  input: number;
  output: number;
  total: number;
};

export type RunSummary = {
  run_id: string;
  agent_id: string;
  status: RunStatus;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  event_count: number;
  tokens: RunTokenSummary;
  cost_usd: number;
  correctness: CorrectnessStatus;
  tool_calls: number;
  errors: number;
  events: StoredEvent[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readTokens(data: Record<string, unknown>): RunTokenSummary {
  const tokens = asRecord(data.tokens);
  const input = typeof tokens.input === "number" ? tokens.input : 0;
  const output = typeof tokens.output === "number" ? tokens.output : 0;
  const total =
    typeof tokens.total === "number"
      ? tokens.total
      : typeof data.tokens === "number"
        ? data.tokens
        : input + output;
  return { input, output, total };
}

function readCostUsd(data: Record<string, unknown>): number {
  return typeof data.cost_usd === "number" ? data.cost_usd : 0;
}

function readCorrectness(data: Record<string, unknown>): CorrectnessStatus | null {
  const value = data.correctness;
  if (value === "verified" || value === "unknown" || value === "failed") {
    return value;
  }
  return null;
}

function eventTime(event: StoredEvent): number {
  return new Date(event.timestamp).getTime();
}

function deriveStatus(events: StoredEvent[]): RunStatus {
  const types = new Set(events.map((e) => e.type));

  if (
    types.has("task.failed") ||
    types.has("task.rejected") ||
    events.some(
      (e) => e.type === "eval.completed" && asRecord(e.data).verdict === "fail"
    )
  ) {
    return "failed";
  }

  if (types.has("budget.exceeded") || types.has("run.cancelled")) {
    return "cancelled";
  }

  if (
    types.has("task.completed") ||
    types.has("task.verified") ||
    events.some(
      (e) => e.type === "eval.completed" && asRecord(e.data).verdict === "pass"
    )
  ) {
    return "completed";
  }

  if (types.has("task.started")) {
    return "running";
  }

  return "unknown";
}

function deriveCorrectness(events: StoredEvent[]): CorrectnessStatus {
  if (events.some((e) => e.type === "task.rejected")) return "failed";
  if (events.some((e) => e.type === "task.verified")) return "verified";
  if (
    events.some(
      (e) => e.type === "eval.completed" && asRecord(e.data).verdict === "fail"
    )
  ) {
    return "failed";
  }
  if (
    events.some(
      (e) => e.type === "eval.completed" && asRecord(e.data).verdict === "pass"
    )
  ) {
    return "verified";
  }

  for (const event of [...events].reverse()) {
    const correctness = readCorrectness(event.data);
    if (correctness) return correctness;
  }

  return "unknown";
}

export function summarizeRun(events: StoredEvent[]): RunSummary | null {
  if (events.length === 0) return null;

  const sorted = [...events].sort((a, b) => eventTime(a) - eventTime(b));
  const run_id = sorted[0]!.run_id;
  const agent_id = sorted[0]!.agent_id;

  const tokens: RunTokenSummary = { input: 0, output: 0, total: 0 };
  let cost_usd = 0;
  let tool_calls = 0;
  let errors = 0;

  for (const event of sorted) {
    const data = event.data;
    const eventTokens = readTokens(data);
    tokens.input += eventTokens.input;
    tokens.output += eventTokens.output;
    tokens.total += eventTokens.total;
    cost_usd += readCostUsd(data);

    if (event.type === "tool.called") tool_calls += 1;
    if (
      event.type === "tool.failed" ||
      event.type === "llm.error" ||
      event.type === "task.failed"
    ) {
      errors += 1;
    }
  }

  const started_at = sorted[0]!.timestamp;
  const completed_at = sorted[sorted.length - 1]!.timestamp;
  const duration_ms = Math.max(0, eventTime(sorted[sorted.length - 1]!) - eventTime(sorted[0]!));

  return {
    run_id,
    agent_id,
    status: deriveStatus(sorted),
    started_at,
    completed_at,
    duration_ms,
    event_count: sorted.length,
    tokens,
    cost_usd,
    correctness: deriveCorrectness(sorted),
    tool_calls,
    errors,
    events: sorted,
  };
}
