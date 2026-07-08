export const AGENT_V1_SPEC = "agent-v1" as const;

export const BETA_EVENT_TYPES = [
  "task.started",
  "task.completed",
  "task.failed",
  "tool.called",
  "tool.failed",
  "agent.started",
  "agent.stopped",
  "llm.error",
] as const;

export type AgentEventType = (typeof BETA_EVENT_TYPES)[number];

export type AgentEventContext = {
  parent_id?: string;
  step?: number;
  framework?: string;
};

export type AgentEventV1 = {
  spec_version: typeof AGENT_V1_SPEC;
  id: string;
  type: AgentEventType;
  timestamp: string;
  run_id: string;
  agent_id: string;
  org_id: string;
  data: Record<string, unknown>;
  context?: AgentEventContext;
};

export type EmitInput = {
  type: AgentEventType;
  data: Record<string, unknown>;
  run_id?: string;
  agent_id?: string;
  context?: AgentEventContext;
};
