import { randomUUID } from "node:crypto";
import { agentEventV1Schema, type AgentEventV1 } from "@aventer/schema";

export type StoredEvent = AgentEventV1 & {
  received_at: string;
  project_id: string;
};

const events: StoredEvent[] = [];
const listeners = new Set<(event: StoredEvent) => void>();

export function storeEvent(event: AgentEventV1, projectId: string): StoredEvent {
  const stored: StoredEvent = {
    ...agentEventV1Schema.parse(event),
    received_at: new Date().toISOString(),
    project_id: projectId,
  };
  events.unshift(stored);
  if (events.length > 500) events.pop();
  for (const listener of listeners) listener(stored);
  return stored;
}

export function listEvents(projectId?: string, limit = 50): StoredEvent[] {
  const filtered = projectId
    ? events.filter((e) => e.project_id === projectId)
    : events;
  return filtered.slice(0, limit);
}

export function subscribe(listener: (event: StoredEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function createProjectId(): string {
  return `proj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

// Beta: single in-memory API key. Replace with DB + hashed keys.
export const BETA_API_KEY = process.env.AVENTER_BETA_API_KEY ?? "avn_beta_dev_key_change_me";

export function resolveProjectFromApiKey(apiKey: string): string | null {
  if (apiKey === BETA_API_KEY) return "proj_beta_default";
  return null;
}
