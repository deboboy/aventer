import type { AgentEvent } from "@aventer/schema";

export type StoredEvent = AgentEvent & {
  received_at: string;
  project_id: string;
};
