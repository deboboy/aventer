import { closePool } from "./db.js";
import { processDueDeliveries } from "./deliver.js";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? "1000");

console.log(`Aventer delivery worker starting (poll ${POLL_MS}ms)`);

async function tick(): Promise<void> {
  try {
    const count = await processDueDeliveries();
    if (count > 0) {
      console.log(`Processed ${count} delivery(ies)`);
    }
  } catch (err) {
    console.error("Worker tick failed:", err);
  }
}

await tick();
setInterval(tick, POLL_MS);

async function shutdown(): Promise<void> {
  await closePool();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
