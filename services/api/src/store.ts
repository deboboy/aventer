import { randomUUID } from "node:crypto";
import type { AgentEvent } from "@aventer/schema";
import { agentEventSchema } from "@aventer/schema";
import { isDatabaseEnabled } from "./db.js";
import { listEventsByRunPg, listEventsPg, storeEventPg } from "./store-pg.js";
import type { StoredEvent } from "./types.js";

export type { StoredEvent } from "./types.js";

const memoryEvents: StoredEvent[] = [];
const listeners = new Set<(event: StoredEvent) => void>();

function notifyListeners(event: StoredEvent): void {
  for (const listener of listeners) listener(event);
}

function storeEventMemory(event: AgentEvent, projectId: string): StoredEvent {
  const stored: StoredEvent = {
    ...agentEventSchema.parse(event),
    received_at: new Date().toISOString(),
    project_id: projectId,
  };
  memoryEvents.unshift(stored);
  if (memoryEvents.length > 500) memoryEvents.pop();
  return stored;
}

export async function storeEvent(
  event: AgentEvent,
  projectId: string
): Promise<StoredEvent> {
  const parsed = agentEventSchema.parse(event);
  const receivedAt = new Date().toISOString();

  const stored = isDatabaseEnabled()
    ? await storeEventPg(parsed, projectId, receivedAt)
    : storeEventMemory(parsed, projectId);

  notifyListeners(stored);
  return stored;
}

export async function listEvents(
  projectId: string,
  limit = 50
): Promise<StoredEvent[]> {
  if (isDatabaseEnabled()) {
    return listEventsPg(projectId, limit);
  }

  return memoryEvents.filter((e) => e.project_id === projectId).slice(0, limit);
}

export async function listEventsByRun(
  projectId: string,
  runId: string
): Promise<StoredEvent[]> {
  if (isDatabaseEnabled()) {
    return listEventsByRunPg(projectId, runId);
  }

  return memoryEvents
    .filter((e) => e.project_id === projectId && e.run_id === runId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function subscribe(listener: (event: StoredEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function createProjectId(): string {
  return `proj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export const BETA_API_KEY =
  process.env.AVENTER_BETA_API_KEY ??
  process.env.AVENTER_API_KEY ??
  "avn_beta_dev_key_change_me";

export function resolveProjectFromApiKey(apiKey: string): string | null {
  if (apiKey === BETA_API_KEY) return "proj_beta_default";
  return null;
}
