import { serve } from "@hono/node-server";
import { validateSubscriberUrl } from "@aventer/delivery";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { corsMiddleware } from "./cors.js";
import { agentEventV1Schema } from "@aventer/schema";
import {
  createSubscriber,
  deleteSubscriber,
  listDeliveries,
  listSubscribers,
  replayDelivery,
} from "./delivery/enqueue.js";
import { checkDatabaseConnection, initDatabase, isDatabaseEnabled } from "./init-db.js";
import {
  listEvents,
  resolveProjectFromApiKey,
  storeEvent,
  subscribe,
} from "./store.js";

const app = new Hono();

app.use("*", corsMiddleware());

function resolveProjectFromAuth(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return resolveProjectFromApiKey(auth.slice("Bearer ".length));
}

app.get("/health", async (c) => {
  const db = isDatabaseEnabled();
  let dbStatus: "connected" | "memory" | "error" = db ? "connected" : "memory";

  if (db) {
    try {
      await checkDatabaseConnection();
    } catch {
      dbStatus = "error";
      return c.json({ status: "degraded", service: "aventer-api", db: dbStatus }, 503);
    }
  }

  return c.json({ status: "ok", service: "aventer-api", db: dbStatus });
});

app.post("/v1/events", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "missing_api_key" }, 401);
  }

  const apiKey = auth.slice("Bearer ".length);
  const projectId = resolveProjectFromApiKey(apiKey);
  if (!projectId) {
    return c.json({ error: "invalid_api_key" }, 401);
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const parsed = agentEventV1Schema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_event", details: parsed.error.flatten() }, 400);
  }

  const stored = await storeEvent(parsed.data, projectId);
  return c.json({ id: stored.id, received_at: stored.received_at }, 202);
});

app.get("/v1/events", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "missing_api_key" }, 401);
  }

  const projectId = resolveProjectFromApiKey(auth.slice("Bearer ".length));
  if (!projectId) {
    return c.json({ error: "invalid_api_key" }, 401);
  }

  const limit = Number(c.req.query("limit") ?? "50");
  const events = await listEvents(projectId, limit);
  return c.json({ events });
});

app.post("/v1/subscribers", async (c) => {
  if (!isDatabaseEnabled()) {
    return c.json({ error: "database_required" }, 503);
  }

  const projectId = resolveProjectFromAuth(c);
  if (!projectId) return c.json({ error: "missing_api_key" }, 401);

  let body: { url?: string; secret?: string; event_types?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (!body.url || !body.secret) {
    return c.json({ error: "url_and_secret_required" }, 400);
  }

  try {
    validateSubscriberUrl(body.url);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "invalid_url" }, 400);
  }

  const subscriber = await createSubscriber(projectId, {
    url: body.url,
    secret: body.secret,
    event_types: body.event_types,
  });

  return c.json(
    {
      id: subscriber.id,
      url: subscriber.url,
      event_types: subscriber.event_types,
      status: subscriber.status,
      created_at: subscriber.created_at,
    },
    201
  );
});

app.get("/v1/subscribers", async (c) => {
  if (!isDatabaseEnabled()) {
    return c.json({ error: "database_required" }, 503);
  }

  const projectId = resolveProjectFromAuth(c);
  if (!projectId) return c.json({ error: "missing_api_key" }, 401);

  const subscribers = await listSubscribers(projectId);
  return c.json({ subscribers });
});

app.delete("/v1/subscribers/:id", async (c) => {
  if (!isDatabaseEnabled()) {
    return c.json({ error: "database_required" }, 503);
  }

  const projectId = resolveProjectFromAuth(c);
  if (!projectId) return c.json({ error: "missing_api_key" }, 401);

  const deleted = await deleteSubscriber(projectId, c.req.param("id"));
  if (!deleted) return c.json({ error: "not_found" }, 404);
  return c.body(null, 204);
});

app.get("/v1/deliveries", async (c) => {
  if (!isDatabaseEnabled()) {
    return c.json({ error: "database_required" }, 503);
  }

  const projectId = resolveProjectFromAuth(c);
  if (!projectId) return c.json({ error: "missing_api_key" }, 401);

  const status = c.req.query("status");
  const limit = Number(c.req.query("limit") ?? "50");
  const deliveries = await listDeliveries(projectId, status, limit);
  return c.json({ deliveries });
});

app.post("/v1/deliveries/:id/replay", async (c) => {
  if (!isDatabaseEnabled()) {
    return c.json({ error: "database_required" }, 503);
  }

  const projectId = resolveProjectFromAuth(c);
  if (!projectId) return c.json({ error: "missing_api_key" }, 401);

  const replayed = await replayDelivery(projectId, c.req.param("id"));
  if (!replayed) return c.json({ error: "not_found_or_not_dlq" }, 404);
  return c.json({ replayed: true });
});

function resolveApiKeyFromRequest(c: {
  req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined };
}): string | null {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice("Bearer ".length);
  }
  const queryKey = c.req.query("api_key");
  return queryKey ?? null;
}

app.get("/v1/events/stream", (c) => {
  const apiKey = resolveApiKeyFromRequest(c);
  if (!apiKey) {
    return c.json({ error: "missing_api_key" }, 401);
  }

  const projectId = resolveProjectFromApiKey(apiKey);
  if (!projectId) {
    return c.json({ error: "invalid_api_key" }, 401);
  }

  return streamSSE(c, async (stream) => {
    const unsubscribe = subscribe((event) => {
      if (event.project_id !== projectId) return;
      void stream.writeSSE({ data: JSON.stringify(event), event: "agent-event" });
    });

    await stream.writeSSE({ data: JSON.stringify({ connected: true }), event: "connected" });

    const keepAlive = setInterval(() => {
      void stream.writeSSE({ data: "{}", event: "ping" });
    }, 15000);

    stream.onAbort(() => {
      clearInterval(keepAlive);
      unsubscribe();
    });

    await new Promise(() => {});
  });
});

const port = Number(process.env.PORT ?? "3001");

await initDatabase();

serve({ fetch: app.fetch, port }, () => {
  console.log(`Aventer API listening on http://localhost:${port}`);
});

export default app;
