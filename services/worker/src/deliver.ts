import {
  MAX_DELIVERY_ATTEMPTS,
  nextRetryDelayMs,
  webhookHeaders,
} from "@aventer/delivery";
import { getPool } from "./db.js";

const BATCH_SIZE = 10;
const FETCH_TIMEOUT_MS = 30_000;

type DueDelivery = {
  delivery_id: string;
  attempt_count: number;
  subscriber_url: string;
  subscriber_secret: string;
  event_id: string;
  spec_version: string;
  type: string;
  timestamp: Date;
  run_id: string;
  agent_id: string;
  org_id: string;
  data: Record<string, unknown>;
  context: Record<string, unknown> | null;
};

function buildPayload(row: DueDelivery, attemptCount: number): string {
  const event = {
    spec_version: row.spec_version,
    id: row.event_id,
    type: row.type,
    timestamp: row.timestamp.toISOString(),
    run_id: row.run_id,
    agent_id: row.agent_id,
    org_id: row.org_id,
    data: row.data ?? {},
    ...(row.context ? { context: row.context } : {}),
    ...(attemptCount > 0 ? { retry_of: row.event_id, delivery_attempt: attemptCount + 1 } : {}),
  };
  return JSON.stringify(event);
}

async function claimDueDeliveries(): Promise<DueDelivery[]> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<DueDelivery>(
      `SELECT d.id AS delivery_id, d.attempt_count,
              s.url AS subscriber_url, s.secret AS subscriber_secret,
              e.id AS event_id, e.spec_version, e.type, e.timestamp,
              e.run_id, e.agent_id, e.org_id, e.data, e.context
       FROM deliveries d
       JOIN subscribers s ON s.id = d.subscriber_id
       JOIN events e ON e.id = d.event_id
       WHERE d.status IN ('pending', 'retry')
         AND d.next_attempt_at <= now()
         AND s.status = 'active'
       ORDER BY d.next_attempt_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );

    for (const row of result.rows) {
      await client.query(
        `UPDATE deliveries SET status = 'retry' WHERE id = $1`,
        [row.delivery_id]
      );
    }

    await client.query("COMMIT");
    return result.rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function markDelivered(deliveryId: string): Promise<void> {
  await getPool().query(
    `UPDATE deliveries
     SET status = 'delivered', delivered_at = now(), last_error = NULL
     WHERE id = $1`,
    [deliveryId]
  );
}

async function markFailed(
  deliveryId: string,
  attemptCount: number,
  error: string,
  statusCode: number | null
): Promise<void> {
  const nextAttempt = attemptCount + 1;
  const delayMs = nextRetryDelayMs(nextAttempt);

  if (delayMs === null || nextAttempt >= MAX_DELIVERY_ATTEMPTS) {
    await getPool().query(
      `UPDATE deliveries
       SET status = 'dlq', attempt_count = $2, last_error = $3, last_status_code = $4
       WHERE id = $1`,
      [deliveryId, nextAttempt, error, statusCode]
    );
    return;
  }

  const nextAt = new Date(Date.now() + delayMs).toISOString();

  await getPool().query(
    `UPDATE deliveries
     SET status = 'retry', attempt_count = $2, last_error = $3, last_status_code = $4,
         next_attempt_at = $5
     WHERE id = $1`,
    [deliveryId, nextAttempt, error, statusCode, nextAt]
  );
}

async function deliverOne(row: DueDelivery): Promise<void> {
  const body = buildPayload(row, row.attempt_count);
  const headers = webhookHeaders(row.subscriber_secret, body, row.event_id);

  try {
    const response = await fetch(row.subscriber_url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      await markDelivered(row.delivery_id);
      console.log(`Delivered ${row.event_id} → ${row.subscriber_url} (${response.status})`);
      return;
    }

    const text = await response.text().catch(() => "");
    await markFailed(
      row.delivery_id,
      row.attempt_count,
      text.slice(0, 500) || `HTTP ${response.status}`,
      response.status
    );
    console.warn(
      `Delivery failed ${row.event_id} → ${row.subscriber_url} (${response.status})`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(row.delivery_id, row.attempt_count, message, null);
    console.warn(`Delivery error ${row.event_id} → ${row.subscriber_url}: ${message}`);
  }
}

export async function processDueDeliveries(): Promise<number> {
  const due = await claimDueDeliveries();
  await Promise.all(due.map((row) => deliverOne(row)));
  return due.length;
}
