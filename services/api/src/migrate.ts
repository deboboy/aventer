import { runMigrations, closePool } from "./db.js";

try {
  await runMigrations();
  console.log("Migrations applied successfully");
} finally {
  await closePool();
}
