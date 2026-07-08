import { randomUUID } from "node:crypto";
import { getPool } from "../db.js";
import type { StoredEvent } from "../types.js";

type SubscriberRow = {
  id: string;
  project_id: string;
  url: string;
  secret: string;
  event_types: string[];
  status: string;
};

export async function enqueueDeliveriesForEvent(event: StoredEvent): Promise<number> {
  const pool = getPool();
  const subscribers = await pool.query<SubscriberRow>(
    `SELECT id, project_id, url, secret, event_types, status
     FROM subscribers
     WHERE project_id = $1 AND status = 'active'`,
    [event.project_id]
  );

  let enqueued = 0;
  for (const subscriber of subscribers.rows) {
    if (!matchesEventFilter(subscriber.event_types, event.type)) continue;

    const deliveryId = `del_${randomUUID().replace(/-/g, "")}`;
    const result = await pool.query(
      `INSERT INTO deliveries (id, event_id, subscriber_id, project_id, status, next_attempt_at)
       VALUES ($1, $2, $3, $4, 'pending', now())
       ON CONFLICT (event_id, subscriber_id) DO NOTHING`,
      [deliveryId, event.id, subscriber.id, event.project_id]
    );

    if (result.rowCount && result.rowCount > 0) enqueued += 1;
  }

  return enqueued;
}

function matchesEventFilter(eventTypes: string[], type: string): boolean {
  if (!eventTypes.length) return true;
  return eventTypes.includes(type);
}

export type CreateSubscriberInput = {
  url: string;
  secret: string;
  event_types?: string[];
};

export async function createSubscriber(
  projectId: string,
  input: CreateSubscriberInput
): Promise<SubscriberRow & { created_at: Date }> {
  const pool = getPool();
  const id = `sub_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const result = await pool.query<SubscriberRow & { created_at: Date }>(
    `INSERT INTO subscribers (id, project_id, url, secret, event_types)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, project_id, url, secret, event_types, status, created_at`,
    [id, projectId, input.url, input.secret, input.event_types ?? []]
  );
  return result.rows[0]!;
}

export async function listSubscribers(projectId: string) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, project_id, url, event_types, status, created_at
     FROM subscribers
     WHERE project_id = $1
     ORDER BY created_at DESC`,
    [projectId]
  );
  return result.rows;
}

export async function deleteSubscriber(projectId: string, subscriberId: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM subscribers WHERE id = $1 AND project_id = $2`,
    [subscriberId, projectId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listDeliveries(projectId: string, status?: string, limit = 50) {
  const pool = getPool();
  const base = `
    SELECT d.id, d.event_id, d.subscriber_id, d.status, d.attempt_count,
           d.next_attempt_at, d.last_error, d.last_status_code,
           d.created_at, d.delivered_at, s.url AS subscriber_url
    FROM deliveries d
    JOIN subscribers s ON s.id = d.subscriber_id
    WHERE d.project_id = $1`;

  if (status) {
    const result = await pool.query(
      `${base} AND d.status = $2 ORDER BY d.created_at DESC LIMIT $3`,
      [projectId, status, limit]
    );
    return result.rows;
  }

  const result = await pool.query(
    `${base} ORDER BY d.created_at DESC LIMIT $2`,
    [projectId, limit]
  );
  return result.rows;
}

export async function replayDelivery(projectId: string, deliveryId: string): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE deliveries
     SET status = 'pending', attempt_count = 0, next_attempt_at = now(),
         last_error = NULL, last_status_code = NULL, delivered_at = NULL
     WHERE id = $1 AND project_id = $2 AND status = 'dlq'`,
    [deliveryId, projectId]
  );
  return (result.rowCount ?? 0) > 0;
}
