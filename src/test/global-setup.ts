import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

let container: StartedPostgreSqlContainer | undefined;

export default async function setup() {
  // Ryuk (the reaper sidecar) won't start on some local Docker/Podman setups
  // and stalls every launch; default it off — cleanup is explicit below.
  // Set TESTCONTAINERS_RYUK_DISABLED=false to re-enable it where it works.
  process.env.TESTCONTAINERS_RYUK_DISABLED ??= "true";

  container = await new PostgreSqlContainer("postgres:18")
    .withDatabase("moneta_test")
    .withUsername("postgres")
    .withPassword("postgres")
    .start();

  try {
    process.env.DATABASE_URL = container.getConnectionUri();
    const sql = postgres(process.env.DATABASE_URL, { max: 1 });
    try {
      await migrate(drizzle(sql), { migrationsFolder: "./src/db/migrations" });
    } finally {
      await sql.end();
    }
  } catch (err) {
    await container.stop();
    throw err;
  }

  return async () => {
    await container?.stop();
  };
}
