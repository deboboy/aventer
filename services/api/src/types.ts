import type { AgentEventV1 } from "@aventer/schema";

export type StoredEvent = AgentEventV1 & {
  received_at: string;
  project_id: string;
};
