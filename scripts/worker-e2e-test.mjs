#!/usr/bin/env node
/**
 * End-to-end worker test: emit events, poll deliveries, probe Last Myle webhook.
 * Loads API key from .env.local (AVENTER_API_KEY or AVENTER_BETA_API_KEY).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envPath = resolve(root, ".env.local");

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  } catch {
    /* optional */
  }
  return env;
}

const env = { ...process.env, ...loadEnv() };
const API_URL = env.AVENTER_API_URL ?? "https://api.aventer.dev";
const API_KEY =
  env.AVENTER_API_KEY ?? env.AVENTER_BETA_API_KEY ?? "";
const WEBHOOK_URL = "https://www.lastmyle.co/api/webhooks/aventer";

async function api(path, opts = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function probeWebhook() {
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const report = {
    apiHealth: null,
    webhookProbe: null,
    subscribers: null,
    emit: null,
    deliveriesBefore: null,
    deliveriesAfter: null,
    success: false,
    notes: [],
  };

  if (!API_KEY) {
    console.log(JSON.stringify({ error: "missing_api_key_in_env_local" }, null, 2));
    process.exit(1);
  }

  const health = await fetch(`${API_URL}/health`).then((r) => r.json());
  report.apiHealth = health;

  report.webhookProbe = await probeWebhook();
  if (report.webhookProbe.status === 503) {
    report.notes.push("Last Myle webhook returns 503 — AVENTER_WEBHOOK_SECRET may not be set in Amplify.");
  } else if (report.webhookProbe.status === 401) {
    report.notes.push("Last Myle webhook is configured (401 without valid signature is expected).");
  }

  const subs = await api("/v1/subscribers");
  report.subscribers = {
    status: subs.status,
    count: Array.isArray(subs.body?.subscribers)
      ? subs.body.subscribers.length
      : null,
    urls: Array.isArray(subs.body?.subscribers)
      ? subs.body.subscribers.map((s) => ({
          id: s.id,
          url: s.url,
          status: s.status,
          event_types: s.event_types,
        }))
      : subs.body,
  };

  const hasLastMyle = Array.isArray(subs.body?.subscribers)
    && subs.body.subscribers.some(
      (s) => s.url === WEBHOOK_URL && s.status === "active"
    );

  if (!hasLastMyle) {
    report.notes.push(
      "No active subscriber for www.lastmyle.co — register one with matching webhook secret."
    );
  }

  report.deliveriesBefore = await api("/v1/deliveries?limit=5");

  // Emit via SDK subprocess
  const { spawnSync } = await import("node:child_process");
  const emit = spawnSync(
    "node",
    ["--env-file=.env.local", "./node_modules/tsx/dist/cli.mjs", "examples/emit.ts"],
    { cwd: root, encoding: "utf8", timeout: 30000 }
  );
  report.emit = {
    exitCode: emit.status,
    stdout: emit.stdout?.trim(),
    stderr: emit.stderr?.trim(),
  };

  if (emit.status !== 0) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // Poll deliveries for up to 45s
  let delivered = [];
  for (let i = 0; i < 15; i++) {
    await sleep(3000);
    const d = await api("/v1/deliveries?limit=10");
    report.deliveriesAfter = {
      status: d.status,
      deliveries: d.body?.deliveries?.map((x) => ({
        id: x.id,
        event_id: x.event_id,
        status: x.status,
        subscriber_url: x.subscriber_url,
        attempt_count: x.attempt_count,
        last_status_code: x.last_status_code,
        last_error: x.last_error,
      })),
    };
    delivered = (d.body?.deliveries ?? []).filter(
      (x) =>
        x.subscriber_url === WEBHOOK_URL &&
        (x.status === "delivered" || x.status === "pending" || x.status === "dlq")
    );
    const recentDelivered = delivered.some((x) => x.status === "delivered");
    if (recentDelivered) {
      report.success = true;
      break;
    }
  }

  if (!report.success) {
    const latest = report.deliveriesAfter?.deliveries?.[0];
    if (latest?.status === "dlq") {
      report.notes.push(`Latest delivery in DLQ: ${latest.last_error} (HTTP ${latest.last_status_code})`);
    } else if (latest?.status === "pending") {
      report.notes.push("Deliveries still pending — worker may not be running on VPS.");
    }
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.success ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
