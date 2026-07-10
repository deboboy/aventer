import { randomUUID } from "node:crypto";
import {
  AGENT_V2_SPEC,
  type AgentEvent,
  type AgentEventTypeV2,
  type AgentEventV2,
  type EmitInput,
  emitInputSchema,
} from "@aventer/schema";
import { DEFAULT_API_URL, getConfig, getSpecVersion } from "./config.js";

function resolveApiKey(explicit?: string): string {
  const key =
    explicit ??
    getConfig().apiKey ??
    process.env.AVENTER_API_KEY ??
    process.env.AVENTER_BETA_API_KEY;
  if (!key) {
    throw new Error(
      "Aventer API key required. Set AVENTER_API_KEY or call configure({ apiKey })."
    );
  }
  return key;
}

export function buildEvent(input: EmitInput): AgentEventV2 {
  const cfg = getConfig();
  const parsed = emitInputSchema.parse(input);
  const specVersion = getSpecVersion();
  if (specVersion !== AGENT_V2_SPEC) {
    throw new Error(
      "agent-v1 emit is not supported for v2 event types. Omit specVersion or set specVersion: 'agent-v2'."
    );
  }

  const event: AgentEventV2 = {
    spec_version: AGENT_V2_SPEC,
    id: `evt_${randomUUID().replace(/-/g, "")}`,
    type: parsed.type,
    timestamp: new Date().toISOString(),
    run_id: parsed.run_id ?? cfg.runId ?? `run_${randomUUID().replace(/-/g, "")}`,
    agent_id: parsed.agent_id ?? cfg.agentId ?? "default",
    org_id: cfg.orgId ?? "default",
    data: parsed.data,
    context: parsed.context,
  };

  return event;
}

export type EmitOptions = {
  apiKey?: string;
  apiUrl?: string;
  run_id?: string;
  agent_id?: string;
  context?: EmitInput["context"];
};

export type EmitResult = {
  event: AgentEvent;
  status: number;
};

export async function postEvent(
  event: AgentEvent,
  options: EmitOptions = {}
): Promise<EmitResult> {
  const apiUrl =
    options.apiUrl ?? getConfig().apiUrl ?? process.env.AVENTER_API_URL ?? DEFAULT_API_URL;
  const apiKey = resolveApiKey(options.apiKey);

  const response = await fetch(`${apiUrl}/v1/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Aventer emit failed (${response.status}): ${body}`);
  }

  return { event, status: response.status };
}

export async function emit(
  type: AgentEventTypeV2,
  data: Record<string, unknown>,
  options: EmitOptions = {}
): Promise<EmitResult> {
  const event = buildEvent({
    type,
    data,
    run_id: options.run_id,
    agent_id: options.agent_id,
    context: options.context,
  });
  return postEvent(event, options);
}
