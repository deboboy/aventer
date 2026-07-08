#!/usr/bin/env node
/**
 * Minimal webhook receiver for testing Aventer delivery.
 * Usage: node examples/webhook-receiver.mjs 4000
 */
import { createServer } from "node:http";
import { verifyWebhookSignature } from "@aventer/delivery";

const port = Number(process.argv[2] ?? "4000");
const secret = process.env.WEBHOOK_SECRET ?? "whsec_test_secret";

const server = createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");

  const timestamp = Number(req.headers["x-aventer-timestamp"]);
  const signature = String(req.headers["x-aventer-signature"] ?? "");
  const eventId = req.headers["x-aventer-event-id"];

  const valid = verifyWebhookSignature(secret, body, timestamp, signature);

  console.log("\n--- Webhook received ---");
  console.log("Event ID:", eventId);
  console.log("Signature valid:", valid);
  try {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  } catch {
    console.log(body);
  }
  console.log("------------------------\n");

  res.writeHead(valid ? 200 : 401, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ received: true, verified: valid }));
});

server.listen(port, () => {
  console.log(`Webhook receiver on http://localhost:${port}`);
  console.log(`Using WEBHOOK_SECRET=${secret}`);
});
