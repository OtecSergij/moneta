import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Standalone migration runner, executed at container startup before the server
// starts (see Dockerfile CMD). It is bundled by esbuild into a self-contained
// migrate.cjs because Next's standalone output does NOT expose drizzle-orm /
// postgres in node_modules — they are bundled into the server chunks, not kept
// as external packages, so a plain `node` script could not resolve them.
//
// Reads DATABASE_URL straight from the environment (provided by Coolify); it does
// not import @/env, to keep the bundle small and free of Next-specific wiring.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[migrate] DATABASE_URL is required");
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "./src/db/migrations" });
    console.log("[migrate] database is up to date");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
