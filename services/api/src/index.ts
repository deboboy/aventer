import { serve } from "@hono/node-server";
import { validateSubscriberUrl } from "@aventer/delivery";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { corsMiddleware } from "./cors.js";
import { agentEventSchema } from "@aventer/schema";
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
  listEventsByRun,
  resolveProjectFromApiKey,
  storeEvent,
  subscribe,
} from "./store.js";
import { summarizeRun } from "./runs.js";
import {
  validateCredentials,
  generateToken,
  verifyToken,
  createBetaUser,
  listBetaUsers,
  deleteBetaUser,
  updatePassword,
  type JWTPayload,
} from "./auth.js";

const app = new Hono();

app.use("*", corsMiddleware());

function resolveProjectFromAuth(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return resolveProjectFromApiKey(auth.slice("Bearer ".length));
}

function extractBearerToken(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
}

function verifyAuthToken(c: {
  req: { header: (name: string) => string | undefined };
}): JWTPayload | null {
  const token = extractBearerToken(c);
  if (!token) return null;
  return verifyToken(token);
}

function requireAdmin(c: {
  req: { header: (name: string) => string | undefined };
  json: (data: unknown, status?: number) => Response;
}): JWTPayload | Response {
  const user = verifyAuthToken(c);
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  if (!user.is_admin) {
    return c.json({ error: "admin_required" }, 403);
  }
  return user;
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

app.post("/v1/auth/login", async (c) => {
  if (!isDatabaseEnabled()) {
    return c.json({ error: "database_required" }, 503);
  }

  let body: { username?: string; password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (!body.username || !body.password) {
    return c.json({ error: "username_and_password_required" }, 400);
  }

  const user = await validateCredentials(body.username, body.password);
  if (!user) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const token = generateToken(user);
  return c.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      is_admin: user.is_admin,
    },
  });
});

app.get("/v1/auth/me", async (c) => {
  if (!isDatabaseEnabled()) {
    return c.json({ error: "database_required" }, 503);
  }

  const user = verifyAuthToken(c);
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }

  return c.json({
    user: {
      id: user.user_id,
      username: user.username,
      is_admin: user.is_admin,
    },
  });
});

app.post("/v1/admin/users", async (c) => {
  if (!isDatabaseEnabled()) {
    return c.json({ error: "database_required" }, 503);
  }

  const adminCheck = requireAdmin(c);
  if (adminCheck instanceof Response) return adminCheck;

  let body: { username?: string; password?: string; is_admin?: boolean };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (!body.username || !body.password) {
    return c.json({ error: "username_and_password_required" }, 400);
  }

  try {
    const user = await createBetaUser(body.username, body.password, body.is_admin ?? false);
    return c.json(
      {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
        created_at: user.created_at,
      },
      201
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    if (message.includes("duplicate") || message.includes("unique")) {
      return c.json({ error: "username_already_exists" }, 409);
    }
    return c.json({ error: message }, 500);
  }
});

app.get("/v1/admin/users", async (c) => {
  if (!isDatabaseEnabled()) {
    return c.json({ error: "database_required" }, 503);
  }

  const adminCheck = requireAdmin(c);
  if (adminCheck instanceof Response) return adminCheck;

  const users = await listBetaUsers();
  return c.json({ users });
});

app.delete("/v1/admin/users/:id", async (c) => {
  if (!isDatabaseEnabled()) {
    return c.json({ error: "database_required" }, 503);
  }

  const adminCheck = requireAdmin(c);
  if (adminCheck instanceof Response) return adminCheck;

  const deleted = await deleteBetaUser(c.req.param("id"));
  if (!deleted) return c.json({ error: "not_found" }, 404);
  return c.body(null, 204);
});

app.put("/v1/admin/users/:id/password", async (c) => {
  if (!isDatabaseEnabled()) {
    return c.json({ error: "database_required" }, 503);
  }

  const adminCheck = requireAdmin(c);
  if (adminCheck instanceof Response) return adminCheck;

  let body: { password?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (!body.password) {
    return c.json({ error: "password_required" }, 400);
  }

  const updated = await updatePassword(c.req.param("id"), body.password);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ updated: true });
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

  const parsed = agentEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid_event", details: parsed.error.flatten() }, 400);
  }

  const stored = await storeEvent(parsed.data, projectId);
  return c.json(
    { id: stored.id, received_at: stored.received_at, spec_version: stored.spec_version },
    202
  );
});

app.get("/v1/runs/:run_id", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "missing_api_key" }, 401);
  }

  const projectId = resolveProjectFromApiKey(auth.slice("Bearer ".length));
  if (!projectId) {
    return c.json({ error: "invalid_api_key" }, 401);
  }

  const events = await listEventsByRun(projectId, c.req.param("run_id"));
  if (events.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const summary = summarizeRun(events);
  return c.json(summary);
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
  let projectId: string | null = null;

  // Try API key first (for SDK/programmatic access)
  if (apiKey) {
    projectId = resolveProjectFromApiKey(apiKey);
  }

  // If no valid API key, try JWT token (for dashboard user access)
  if (!projectId) {
    const user = verifyAuthToken(c);
    if (user) {
      // All authenticated beta users get access to the default beta project
      projectId = "proj_beta_default";
    }
  }

  if (!projectId) {
    return c.json({ error: "missing_api_key_or_token" }, 401);
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
