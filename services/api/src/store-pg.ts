import type { AgentEvent } from "@aventer/schema";
import { agentEventSchema } from "@aventer/schema";
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
  const event = agentEventSchema.parse({
    spec_version: row.spec_version,
    id: row.id,
    type: row.type,
    timestamp: row.timestamp.toISOString(),
    run_id: row.run_id,
    agent_id: row.agent_id,
    org_id: row.org_id,
    data: row.data ?? {},
    context: row.context ?? undefined,
  });

  return {
    ...event,
    received_at: row.received_at.toISOString(),
    project_id: row.project_id,
  };
}

export async function storeEventPg(
  event: AgentEvent,
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

  const stored = rowToStoredEvent(result.rows[0]!);
  const { enqueueDeliveriesForEvent } = await import("./delivery/enqueue.js");
  await enqueueDeliveriesForEvent(stored);
  return stored;
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

export async function listEventsByRunPg(
  projectId: string,
  runId: string
): Promise<StoredEvent[]> {
  const pool = getPool();
  const result = await pool.query<EventRow>(
    `SELECT * FROM events
     WHERE project_id = $1 AND run_id = $2
     ORDER BY timestamp ASC`,
    [projectId, runId]
  );

  return result.rows.map(rowToStoredEvent);
}
