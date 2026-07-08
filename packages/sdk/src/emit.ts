import { randomUUID } from "node:crypto";
import {
  AGENT_V1_SPEC,
  type AgentEventType,
  type AgentEventV1,
  type EmitInput,
  emitInputSchema,
} from "@aventer/schema";
import { DEFAULT_API_URL, getConfig } from "./config.js";

function resolveApiKey(explicit?: string): string {
  const key = explicit ?? getConfig().apiKey ?? process.env.AVENTER_API_KEY;
  if (!key) {
    throw new Error(
      "Aventer API key required. Set AVENTER_API_KEY or call configure({ apiKey })."
    );
  }
  return key;
}

function buildEvent(input: EmitInput): AgentEventV1 {
  const cfg = getConfig();
  const parsed = emitInputSchema.parse(input);

  return {
    spec_version: AGENT_V1_SPEC,
    id: `evt_${randomUUID().replace(/-/g, "")}`,
    type: parsed.type,
    timestamp: new Date().toISOString(),
    run_id: parsed.run_id ?? cfg.runId ?? `run_${randomUUID().replace(/-/g, "")}`,
    agent_id: parsed.agent_id ?? cfg.agentId ?? "default",
    org_id: cfg.orgId ?? "default",
    data: parsed.data,
    context: parsed.context,
  };
}

export type EmitOptions = {
  apiKey?: string;
  apiUrl?: string;
};

export type EmitResult = {
  event: AgentEventV1;
  status: number;
};

export async function emit(
  type: AgentEventType,
  data: Record<string, unknown>,
  options: EmitOptions = {}
): Promise<EmitResult> {
  const event = buildEvent({ type, data });
  const apiUrl = options.apiUrl ?? getConfig().apiUrl ?? process.env.AVENTER_API_URL ?? DEFAULT_API_URL;
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

export { buildEvent };
