import type { Context, Next } from "hono";

export const corsOrigins = (
  process.env.CORS_ORIGINS ??
  "https://aventer.dev,https://www.aventer.dev,http://localhost:5173"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function resolveAllowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  return corsOrigins.includes(origin) ? origin : null;
}

/** CORS headers must be set before the response body starts (required for SSE). */
export function corsMiddleware() {
  return async (c: Context, next: Next) => {
    const allowedOrigin = resolveAllowedOrigin(c.req.header("Origin"));

    if (allowedOrigin) {
      c.header("Access-Control-Allow-Origin", allowedOrigin);
      c.header("Vary", "Origin");
    }

    if (c.req.method === "OPTIONS") {
      c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
      c.header("Access-Control-Max-Age", "86400");
      return c.body(null, 204);
    }

    await next();
  };
}
