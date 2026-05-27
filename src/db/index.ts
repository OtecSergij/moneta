import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

// Reuse the underlying client across HMR reloads in dev so we don't exhaust
// Postgres connection slots on every save.
const globalForPg = globalThis as unknown as {
  __moneta_pg?: ReturnType<typeof postgres>;
};

const client =
  globalForPg.__moneta_pg ?? postgres(env.DATABASE_URL, { prepare: false });

if (env.NODE_ENV !== "production") {
  globalForPg.__moneta_pg = client;
}

export const db = drizzle(client, { schema });
export type DB = typeof db;
