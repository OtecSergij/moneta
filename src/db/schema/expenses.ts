import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { CURRENCY_CODES } from "../../lib/currency";
import { user } from "./auth";
import { categories } from "./categories";
import { spaces } from "./spaces";

// Postgres ENUM for currency. Five values per business-spec.md §7: RUB
// (default), USD, EUR, RSD, BTC.
//
// `ALTER TYPE ... ADD VALUE` is allowed inside a transaction, but the added
// value cannot be *used* (default, cast, literal comparison) within that
// same transaction unless the enum type was itself created in it — and
// drizzle-migrator wraps every pending migration file into one transaction
// (node_modules/drizzle-orm/pg-core/dialect.js `PgDialect.migrate`). A fresh
// install (0000 and this migration both still pending) would tolerate a
// literal use of a new value because the type is born in that very
// transaction; an already-migrated production database would not, and
// would fail to start. So a literal of a newly added value must never
// appear outside its own `ADD VALUE` line in the migration that adds it —
// enforced by src/db/migrations.itest.ts (AC-21, AC-24).
//
// The label list is CURRENCY_CODES itself, not a copy of it: `currencyMeta`
// (src/lib/currency.ts) has to answer for every value this column can hold,
// and a second hand-maintained list is exactly how the two drift. Imported
// relatively rather than through `@/` — drizzle-kit loads this file with its
// own bundler, and the schema tree has no other alias imports to prove the
// path mapping is honoured there.
export const currencyEnum = pgEnum("currency_code", CURRENCY_CODES);
export type Currency = (typeof currencyEnum.enumValues)[number];

// Individual expense record. Per docs/business-spec.md §4.2.
//
// Money is stored as integer-valued `amount_minor` — never floats (kopecks
// for RUB, satoshis for BTC, etc. — see src/lib/currency.ts for the
// per-currency exponent). See CLAUDE.md "UI / язык" section.
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").notNull(),
    // BIGINT, not INTEGER: BTC's 8-decimal exponent puts 21M BTC at
    // 2.1e15 satoshis, above INTEGER's ~2.1e9 ceiling. `number` mode is
    // exact up to 2^53 (drizzle-orm/pg-core/columns/bigint.js), well above
    // that ceiling, and only applies to column references, not raw `sql<>`
    // fragments (see plan Step 2.2).
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyEnum("currency").notNull().default("RUB"),
    // Required: every expense carries a short description (business-spec §4.2).
    note: text("note").notNull(),
    // App-level default to "today in user's timezone"; no DB default because
    // the timezone calculation lives in the app. Always set on insert.
    // Future-date validation is in the repository (zod).
    spentAt: date("spent_at", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("expenses_category_idx").on(t.categoryId),
    index("expenses_space_spent_idx").on(t.spaceId, t.spentAt.desc()),
    index("expenses_space_author_created_idx").on(
      t.spaceId,
      t.createdBy,
      t.createdAt.desc(),
    ),
    // RESTRICT: a category with expenses can't be deleted (business-spec §5.3).
    foreignKey({
      name: "expenses_category_same_space_fk",
      columns: [t.categoryId, t.spaceId],
      foreignColumns: [categories.id, categories.spaceId],
    }).onDelete("restrict"),
    check("expenses_amount_positive", sql`${t.amountMinor} > 0`),
    check(
      "expenses_note_len",
      sql`char_length(${t.note}) between 1 and 200`,
    ),
  ],
);
