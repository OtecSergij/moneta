import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = path.join(process.cwd(), "src/db/migrations");
// From src/db/migrations/meta/_journal.json entries[0].when — the folderMillis
// drizzle-migrator stamps migration 0000 with.
const MIGRATION_0000_MILLIS = 1780775530991;

describe("migrations — AC-21: no new-currency literal outside ADD VALUE", () => {
  it("every SQL migration file only mentions a new currency on its own ALTER TYPE ... ADD VALUE line", () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) =>
      f.endsWith(".sql"),
    );
    expect(files.length).toBeGreaterThan(0);

    const newCurrencyLiteral = /'(?:USD|EUR|RSD|BTC)'/;
    const addValueLine = /ALTER TYPE .* ADD VALUE/i;

    for (const file of files) {
      const text = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      for (const line of text.split("\n")) {
        if (newCurrencyLiteral.test(line)) {
          expect(line, `${file}: unexpected currency literal outside ADD VALUE — "${line}"`).toMatch(
            addValueLine,
          );
        }
      }
    }
  });
});

// Pre-mortem scenario 3 (plan): `ALTER TYPE ... ADD VALUE` is allowed inside
// a transaction, but the new value can't be *used* within that same
// transaction unless the enum type was itself created in it too. drizzle
// wraps every pending migration file into one transaction
// (node_modules/drizzle-orm/pg-core/dialect.js). On a database that already
// has 0000 committed from an earlier deploy (production shape), only the
// new migration is pending and runs in its own transaction — the case this
// test reproduces. A database where 0000 is still pending alongside the new
// migration (the default in src/test/global-setup.ts, and what most itest
// files run against) would tolerate a stray new-currency literal because
// the type is born in that same transaction, so it would not catch AC-21
// violations — only a database seeded to look like production does.
describe("migrations — AC-24: applied in production shape", () => {
  it("runs the pending migrations cleanly against a database where 0000 is already committed", async () => {
    const baseUrl = new URL(process.env.DATABASE_URL as string);
    const dbName = `moneta_migration_${randomUUID().replace(/-/g, "")}`;
    const freshUrl = new URL(baseUrl.toString());
    freshUrl.pathname = `/${dbName}`;

    const admin = postgres(baseUrl.toString(), { max: 1 });
    try {
      await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    } finally {
      await admin.end();
    }

    try {
      const zeroText = readFileSync(
        path.join(MIGRATIONS_DIR, "0000_light_anthem.sql"),
        "utf8",
      );

      // Separate connection standing in for the earlier deploy that ran
      // 0000: fully committed and closed before the connection below ever
      // opens, so nothing here shares a transaction with migrate().
      const seed = postgres(freshUrl.toString(), { max: 1 });
      try {
        for (const stmt of zeroText.split("--> statement-breakpoint")) {
          const trimmed = stmt.trim();
          if (trimmed) await seed.unsafe(stmt);
        }

        // Mirrors PgDialect.migrate's own bookkeeping DDL verbatim
        // (node_modules/drizzle-orm/pg-core/dialect.js) — this schema and
        // table don't exist yet because migrate() has never run here.
        await seed.unsafe(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
        await seed.unsafe(`
          CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
          )
        `);

        const hash = createHash("sha256").update(zeroText).digest("hex");
        await seed.unsafe(
          `INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES ($1, $2)`,
          [hash, MIGRATION_0000_MILLIS],
        );
      } finally {
        await seed.end();
      }

      // Fresh connection for the deploy that runs every later migration —
      // the one migrate() actually wraps in a transaction. Without the
      // bookkeeping row above, migrate() would treat 0000 as pending too
      // and fail on "type currency_code already exists" — a red test for
      // the wrong reason (plan AC-24).
      const migrateClient = postgres(freshUrl.toString(), { max: 1 });
      try {
        await migrate(drizzle(migrateClient), {
          migrationsFolder: "./src/db/migrations",
        });

        const enumRows = await migrateClient<{ enumlabel: string }[]>`
          select enumlabel from pg_enum
          join pg_type on pg_type.oid = pg_enum.enumtypid
          where pg_type.typname = 'currency_code'
          order by enumsortorder
        `;
        expect(enumRows.map((r) => r.enumlabel)).toEqual([
          "RUB",
          "USD",
          "EUR",
          "RSD",
          "BTC",
        ]);

        const bookkeeping = await migrateClient<
          { hash: string; created_at: string }[]
        >`
          select hash, created_at from "drizzle"."__drizzle_migrations"
          order by created_at
        `;
        const journal = JSON.parse(
          readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
        ) as { entries: unknown[] };
        expect(bookkeeping).toHaveLength(journal.entries.length);
        expect(Number(bookkeeping[0].created_at)).toBe(MIGRATION_0000_MILLIS);
        for (const later of bookkeeping.slice(1)) {
          expect(Number(later.created_at)).toBeGreaterThan(
            MIGRATION_0000_MILLIS,
          );
        }

        const fxRatesTable = await migrateClient`
          select 1 from information_schema.tables where table_name = 'fx_rates'
        `;
        expect(fxRatesTable).toHaveLength(1);
      } finally {
        await migrateClient.end();
      }
    } finally {
      const cleanup = postgres(baseUrl.toString(), { max: 1 });
      try {
        await cleanup.unsafe(
          `DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`,
        );
      } finally {
        await cleanup.end();
      }
    }
  });
});
