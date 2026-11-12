import { createHash, randomUUID } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
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

async function withScratchDatabase(
  run: (url: string) => Promise<void>,
): Promise<void> {
  const baseUrl = new URL(process.env.DATABASE_URL as string);
  const dbName = `moneta_phase1_${randomUUID().replace(/-/g, "")}`;
  const url = new URL(baseUrl.toString());
  url.pathname = `/${dbName}`;

  const admin = postgres(baseUrl.toString(), { max: 1 });
  try {
    await admin.unsafe(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }
  try {
    await run(url.toString());
  } finally {
    const cleanup = postgres(baseUrl.toString(), { max: 1 });
    try {
      await cleanup.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    } finally {
      await cleanup.end();
    }
  }
}

function migrationsUpTo(lastIdx: number): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "moneta-migrations-"));
  mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  const entries = journal.entries.filter((e) => e.idx <= lastIdx);
  for (const e of entries) {
    copyFileSync(
      path.join(MIGRATIONS_DIR, `${e.tag}.sql`),
      path.join(dir, `${e.tag}.sql`),
    );
  }
  writeFileSync(
    path.join(dir, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  return dir;
}

describe("phase-1 data migration", () => {
  it("moves every user's categories and expenses into a space with id = user.id", async () => {
    const oldFolder = migrationsUpTo(2);
    try {
      await withScratchDatabase(async (url) => {
        const sql = postgres(url, { max: 1, onnotice: () => {} });
        try {
          await migrate(drizzle(sql), { migrationsFolder: oldFolder });

          const [withData, noData, unverified, twinA, twinB] = await sql<
            { id: string }[]
          >`
            insert into "user" (name, email, email_verified) values
              ('with-data', ${`${randomUUID()}@t.local`}, true),
              ('no-data', ${`${randomUUID()}@t.local`}, true),
              ('unverified', ${`${randomUUID()}@t.local`}, false),
              ('twin-a', ${`${randomUUID()}@t.local`}, true),
              ('twin-b', ${`${randomUUID()}@t.local`}, true)
            returning id
          `;
          const userIds = [withData, noData, unverified, twinA, twinB].map(
            (u) => u.id,
          );

          const cats = await sql<{ id: string; user_id: string }[]>`
            insert into categories (user_id, name, color) values
              (${withData.id}, 'Еда', '#10B981'),
              (${withData.id}, 'Кафе', '#F97316'),
              (${twinA.id}, 'Дом', '#F59E0B'),
              (${twinB.id}, 'Дом', '#F59E0B')
            returning id, user_id
          `;
          const catOf = (userId: string) =>
            cats.find((c) => c.user_id === userId)!.id;
          const exps = await sql<{ id: string; user_id: string }[]>`
            insert into expenses (user_id, category_id, amount_minor, note, spent_at) values
              (${withData.id}, ${cats[0].id}, 1000, 'a', '2026-01-01'),
              (${withData.id}, ${cats[1].id}, 2000, 'b', '2026-01-02'),
              (${twinA.id}, ${catOf(twinA.id)}, 3000, 'c', '2026-01-03'),
              (${twinB.id}, ${catOf(twinB.id)}, 4000, 'd', '2026-01-04')
            returning id, user_id
          `;

          await migrate(drizzle(sql), {
            migrationsFolder: "./src/db/migrations",
          });

          const spaceRows = await sql<{ id: string }[]>`select id from spaces`;
          expect(spaceRows.map((r) => r.id).sort()).toEqual([...userIds].sort());

          const members = await sql<
            { space_id: string; user_id: string; role: string }[]
          >`select space_id, user_id, role from space_members`;
          expect(members).toHaveLength(userIds.length);
          for (const id of userIds) {
            expect(members.filter((m) => m.user_id === id)).toEqual([
              { space_id: id, user_id: id, role: "owner" },
            ]);
          }

          const catsAfter = await sql<
            { id: string; space_id: string; created_by: string }[]
          >`select id, space_id, created_by from categories`;
          expect(catsAfter).toHaveLength(cats.length);
          for (const c of cats) {
            expect(catsAfter.find((r) => r.id === c.id)).toEqual({
              id: c.id,
              space_id: c.user_id,
              created_by: c.user_id,
            });
          }

          const expsAfter = await sql<
            { id: string; space_id: string; created_by: string }[]
          >`select id, space_id, created_by from expenses`;
          expect(expsAfter).toHaveLength(exps.length);
          for (const e of exps) {
            expect(expsAfter.find((r) => r.id === e.id)).toEqual({
              id: e.id,
              space_id: e.user_id,
              created_by: e.user_id,
            });
          }

          const columns = await sql<
            { table_name: string; column_name: string; is_nullable: string }[]
          >`
            select table_name, column_name, is_nullable
            from information_schema.columns
            where table_schema = 'public'
              and table_name in ('categories', 'expenses')
              and column_name in ('space_id', 'created_by', 'user_id')
            order by table_name, column_name
          `;
          expect(columns).toEqual([
            { table_name: "categories", column_name: "created_by", is_nullable: "NO" },
            { table_name: "categories", column_name: "space_id", is_nullable: "NO" },
            { table_name: "expenses", column_name: "created_by", is_nullable: "NO" },
            { table_name: "expenses", column_name: "space_id", is_nullable: "NO" },
          ]);

          await expect(
            sql`insert into categories (space_id, created_by, name, color)
                values (${twinA.id}, ${twinA.id}, 'Дом', '#F59E0B')`,
          ).rejects.toMatchObject({ code: "23505" });

          const [twinAccount] = await sql<{ id: string }[]>`
            select id from accounts where space_id = ${twinA.id}
          `;
          await expect(
            sql`insert into expenses (space_id, created_by, category_id, amount_minor, note, spent_at, account_id)
                values (${twinA.id}, ${twinA.id}, ${catOf(twinB.id)}, 100, 'x', '2026-01-05', ${twinAccount.id})`,
          ).rejects.toMatchObject({ code: "23503" });
        } finally {
          await sql.end();
        }
      });
    } finally {
      rmSync(oldFolder, { recursive: true, force: true });
    }
  });
});

describe("expense account backfill migration", () => {
  it("gives every expense without an account a zero-balance account of its currency", async () => {
    const oldFolder = migrationsUpTo(7);
    try {
      await withScratchDatabase(async (url) => {
        const sql = postgres(url, { max: 1, onnotice: () => {} });
        try {
          await migrate(drizzle(sql), { migrationsFolder: oldFolder });

          const [u] = await sql<{ id: string }[]>`
            insert into "user" (name, email, email_verified)
            values ('u', ${`${randomUUID()}@t.local`}, true) returning id
          `;
          const [single, multi, linkedOnly] = await sql<{ id: string }[]>`
            insert into spaces (created_at) values (now()), (now()), (now()) returning id
          `;
          const cats = await sql<{ id: string; space_id: string }[]>`
            insert into categories (space_id, created_by, name, color) values
              (${single.id}, ${u.id}, 'Еда', '#10B981'),
              (${multi.id}, ${u.id}, 'Еда', '#10B981'),
              (${linkedOnly.id}, ${u.id}, 'Еда', '#10B981')
            returning id, space_id
          `;
          const catOf = (spaceId: string) => cats.find((c) => c.space_id === spaceId)!.id;
          const [taken, card] = await sql<{ id: string }[]>`
            insert into accounts (space_id, created_by, name, currency, anchor_amount_minor) values
              (${single.id}, ${u.id}, 'Основной', 'RUB', 500),
              (${linkedOnly.id}, ${u.id}, 'Карта', 'RUB', 500)
            returning id
          `;
          await sql`
            insert into expenses (space_id, created_by, category_id, amount_minor, currency, note, spent_at, account_id) values
              (${single.id}, ${u.id}, ${catOf(single.id)}, 100, 'RUB', 'a', '2026-01-01', null),
              (${single.id}, ${u.id}, ${catOf(single.id)}, 200, 'RUB', 'b', '2026-01-02', null),
              (${single.id}, ${u.id}, ${catOf(single.id)}, 300, 'RUB', 'c', '2026-01-03', ${taken.id}),
              (${multi.id}, ${u.id}, ${catOf(multi.id)}, 400, 'RUB', 'd', '2026-01-04', null),
              (${multi.id}, ${u.id}, ${catOf(multi.id)}, 500, 'USD', 'e', '2026-01-05', null),
              (${multi.id}, ${u.id}, ${catOf(multi.id)}, 600, 'RSD', 'f', '2026-01-06', null),
              (${linkedOnly.id}, ${u.id}, ${catOf(linkedOnly.id)}, 700, 'RUB', 'g', '2026-01-07', ${card.id}),
              (${multi.id}, ${u.id}, ${catOf(multi.id)}, 800, 'RUB', 'h', '2026-01-08', ${card.id})
          `;

          await migrate(drizzle(sql), { migrationsFolder: "./src/db/migrations" });

          const accountRows = await sql<
            { id: string; space_id: string; name: string; currency: string; anchor_amount_minor: string }[]
          >`select id, space_id, name, currency, anchor_amount_minor from accounts order by name`;
          const created = accountRows.filter((a) => a.id !== taken.id && a.id !== card.id);
          expect(
            created.map(({ space_id, name, currency, anchor_amount_minor }) => ({
              space_id,
              name,
              currency,
              anchor: Number(anchor_amount_minor),
            })),
          ).toEqual(
            expect.arrayContaining([
              { space_id: single.id, name: "Основной 2", currency: "RUB", anchor: 0 },
              { space_id: multi.id, name: "Основной ₽", currency: "RUB", anchor: 0 },
              { space_id: multi.id, name: "Основной $", currency: "USD", anchor: 0 },
              { space_id: multi.id, name: "Основной RSD", currency: "RSD", anchor: 0 },
            ]),
          );
          expect(created).toHaveLength(4);

          const expenseRows = await sql<
            { note: string; account_id: string; currency: string }[]
          >`select note, account_id, currency from expenses order by note`;
          const accountOf = (id: string) => accountRows.find((a) => a.id === id)!;
          for (const e of expenseRows) {
            expect(accountOf(e.account_id).currency).toBe(e.currency);
          }
          expect(accountOf(expenseRows[0].account_id).name).toBe("Основной 2");
          expect(expenseRows[0].account_id).toBe(expenseRows[1].account_id);
          expect(expenseRows[2].account_id).toBe(taken.id);
          expect(expenseRows[6].account_id).toBe(card.id);
          expect(expenseRows[7].account_id).toBe(expenseRows[3].account_id);

          const balances = await sql<{ name: string; spent: string }[]>`
            select a.name, coalesce(sum(e.amount_minor) filter (where e.created_at > a.anchor_at), 0) as spent
            from accounts a left join expenses e on e.account_id = a.id
            where a.anchor_amount_minor = 0
            group by a.id
          `;
          expect(balances.map((b) => Number(b.spent))).toEqual([0, 0, 0, 0]);

          const [column] = await sql<{ is_nullable: string }[]>`
            select is_nullable from information_schema.columns
            where table_name = 'expenses' and column_name = 'account_id'
          `;
          expect(column.is_nullable).toBe("NO");

          await expect(
            sql`insert into expenses (space_id, created_by, category_id, amount_minor, note, spent_at, account_id)
                values (${multi.id}, ${u.id}, ${catOf(multi.id)}, 100, 'x', '2026-01-09', ${card.id})`,
          ).rejects.toMatchObject({ code: "23503" });

          await sql`delete from accounts where id = ${card.id}`;
          const remaining = await sql`select 1 from expenses where space_id = ${linkedOnly.id}`;
          expect(remaining).toHaveLength(0);
        } finally {
          await sql.end();
        }
      });
    } finally {
      rmSync(oldFolder, { recursive: true, force: true });
    }
  });
});
