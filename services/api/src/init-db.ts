import { checkDatabaseConnection, closePool, isDatabaseEnabled, runMigrations } from "./db.js";

export async function initDatabase(): Promise<void> {
  if (!isDatabaseEnabled()) {
    console.warn("DATABASE_URL not set — using in-memory event store");
    return;
  }

  await runMigrations();
  await checkDatabaseConnection();
  console.log("Postgres connected and migrations applied");
}

export async function shutdownDatabase(): Promise<void> {
  await closePool();
}

export { checkDatabaseConnection, isDatabaseEnabled };
