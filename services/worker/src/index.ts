/**
 * Phase 1 stub — delivery worker with retry + DLQ lands in Phase 2.
 * Run alongside @aventer/api once Postgres + pg-boss are wired.
 */

const POLL_MS = 5000;

console.log("Aventer worker (stub) — delivery queue not yet connected.");
console.log("Phase 2: HTTP outbound, 6-attempt retry, DLQ replay.");

setInterval(() => {
  // Placeholder heartbeat for process supervisors
}, POLL_MS);
