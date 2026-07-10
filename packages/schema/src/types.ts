export const AGENT_V1_SPEC = "agent-v1" as const;
export const AGENT_V2_SPEC = "agent-v2" as const;

export const AGENT_SPECS = [AGENT_V1_SPEC, AGENT_V2_SPEC] as const;
export type AgentSpecVersion = (typeof AGENT_SPECS)[number];

/** v1 event types (unchanged) */
export const V1_EVENT_TYPES = [
  "task.started",
  "task.completed",
  "task.failed",
  "tool.called",
  "tool.failed",
  "agent.started",
  "agent.stopped",
  "llm.error",
] as const;

/** @deprecated use V1_EVENT_TYPES */
export const BETA_EVENT_TYPES = V1_EVENT_TYPES;

export type AgentEventTypeV1 = (typeof V1_EVENT_TYPES)[number];

/** v2-only event types */
export const V2_ONLY_EVENT_TYPES = [
  "task.verified",
  "task.rejected",
  "eval.started",
  "eval.completed",
  "budget.warning",
  "budget.exceeded",
  "loop.detected",
  "run.cancelled",
] as const;

export type AgentEventTypeV2Only = (typeof V2_ONLY_EVENT_TYPES)[number];

export const V2_EVENT_TYPES = [...V1_EVENT_TYPES, ...V2_ONLY_EVENT_TYPES] as const;

export type AgentEventTypeV2 = (typeof V2_EVENT_TYPES)[number];

/** Default for new SDK emits */
export type AgentEventType = AgentEventTypeV2;

export type AgentEventContext = {
  parent_id?: string;
  step?: number;
  framework?: string;
};

export type AgentEventContextV2 = AgentEventContext & {
  trace_id?: string;
  span_id?: string;
  environment?: string;
};

export type AgentEventBase<TSpec extends AgentSpecVersion, TType extends string> = {
  spec_version: TSpec;
  id: string;
  type: TType;
  timestamp: string;
  run_id: string;
  agent_id: string;
  org_id: string;
  data: Record<string, unknown>;
};

export type AgentEventV1 = AgentEventBase<typeof AGENT_V1_SPEC, AgentEventTypeV1> & {
  context?: AgentEventContext;
};

export type AgentEventV2 = AgentEventBase<typeof AGENT_V2_SPEC, AgentEventTypeV2> & {
  context?: AgentEventContextV2;
};

export type AgentEvent = AgentEventV1 | AgentEventV2;

export type EmitInput = {
  type: AgentEventTypeV2;
  data: Record<string, unknown>;
  run_id?: string;
  agent_id?: string;
  context?: AgentEventContextV2;
};

export type EvaluatorType = "golden_set" | "llm_judge" | "human" | "rule" | "custom";
export type EvalVerdict = "pass" | "fail" | "inconclusive";

export type CorrectnessStatus = "verified" | "unknown" | "failed";

export type VerifyInput = {
  task_id: string;
  run_id?: string;
  agent_id?: string;
  evaluator: string;
  evaluator_type: EvaluatorType;
  score: number;
  threshold?: number;
  verdict: EvalVerdict;
  evidence?: Record<string, unknown>;
  input_hash?: string;
  output_hash?: string;
  trace_id?: string;
  span_id?: string;
};
