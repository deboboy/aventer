import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { corsMiddleware } from "./cors.js";
import { agentEventV1Schema } from "@aventer/schema";
import {
  listEvents,
  resolveProjectFromApiKey,
  storeEvent,
  subscribe,
} from "./store.js";

const app = new Hono();

app.use("*", corsMiddleware());

app.get("/health", (c) => c.json({ status: "ok", service: "aventer-api" }));

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

  const stored = storeEvent(parsed.data, projectId);
  return c.json({ id: stored.id, received_at: stored.received_at }, 202);
});

app.get("/v1/events", (c) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "missing_api_key" }, 401);
  }

  const projectId = resolveProjectFromApiKey(auth.slice("Bearer ".length));
  if (!projectId) {
    return c.json({ error: "invalid_api_key" }, 401);
  }

  const limit = Number(c.req.query("limit") ?? "50");
  return c.json({ events: listEvents(projectId, limit) });
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

serve({ fetch: app.fetch, port }, () => {
  console.log(`Aventer API listening on http://localhost:${port}`);
});

export default app;
