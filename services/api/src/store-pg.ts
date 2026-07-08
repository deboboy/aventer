import type { AgentEventV1 } from "@aventer/schema";
import { AGENT_V1_SPEC } from "@aventer/schema";
import { getPool } from "./db.js";
import type { StoredEvent } from "./types.js";

type EventRow = {
  id: string;
  project_id: string;
  spec_version: string;
  type: string;
  timestamp: Date;
  run_id: string;
  agent_id: string;
  org_id: string;
  data: Record<string, unknown>;
  context: Record<string, unknown> | null;
  received_at: Date;
};

function rowToStoredEvent(row: EventRow): StoredEvent {
  return {
    spec_version: AGENT_V1_SPEC,
    id: row.id,
    type: row.type as StoredEvent["type"],
    timestamp: row.timestamp.toISOString(),
    run_id: row.run_id,
    agent_id: row.agent_id,
    org_id: row.org_id,
    data: row.data ?? {},
    context: row.context ?? undefined,
    received_at: row.received_at.toISOString(),
    project_id: row.project_id,
  };
}

export async function storeEventPg(
  event: AgentEventV1,
  projectId: string,
  receivedAt: string
): Promise<StoredEvent> {
  const pool = getPool();
  const result = await pool.query<EventRow>(
    `INSERT INTO events (
      id, project_id, spec_version, type, timestamp,
      run_id, agent_id, org_id, data, context, received_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *`,
    [
      event.id,
      projectId,
      event.spec_version,
      event.type,
      event.timestamp,
      event.run_id,
      event.agent_id,
      event.org_id,
      JSON.stringify(event.data),
      event.context ? JSON.stringify(event.context) : null,
      receivedAt,
    ]
  );

  return rowToStoredEvent(result.rows[0]!);
}

export async function listEventsPg(
  projectId: string,
  limit: number
): Promise<StoredEvent[]> {
  const pool = getPool();
  const result = await pool.query<EventRow>(
    `SELECT * FROM events
     WHERE project_id = $1
     ORDER BY received_at DESC
     LIMIT $2`,
    [projectId, limit]
  );

  return result.rows.map(rowToStoredEvent);
}
