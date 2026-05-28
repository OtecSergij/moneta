import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Vitest globalSetup: bring the `moneta_test` database to current schema
// before any test file loads. Runs once per `vitest` invocation.
//
// Has its own DB connection (admin → postgres db; then test → moneta_test);
// does NOT import `@/db` to keep env wiring simple.
//
// See docs/todo.md "Testcontainers" for the planned upgrade.

const ADMIN_URL = "postgresql://postgres:postgres@localhost:5432/postgres";
const TEST_URL =
  "postgresql://postgres:postgres@localhost:5432/moneta_test";

export default async function setup() {
  // 1. Ensure the test DB exists.
  const admin = postgres(ADMIN_URL, { max: 1 });
  try {
    const rows =
      await admin`SELECT 1 FROM pg_database WHERE datname = 'moneta_test'`;
    if (rows.length === 0) {
      await admin`CREATE DATABASE moneta_test`;
    }
  } finally {
    await admin.end();
  }

  // 2. Apply migrations.
  const sql = postgres(TEST_URL, { max: 1 });
  try {
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
  } finally {
    await sql.end();
  }
}
