import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { categories } from "./categories";

// Postgres ENUM for currency. MVP is single-currency (₽), but the type is
// in place so future expansion is `ALTER TYPE currency_code ADD VALUE 'USD'`
// — single line, no data migration, no column rewrite.
//
// Workflow when adding a currency later:
//   1. Extend the literal array below.
//   2. `npm run db:generate` — Drizzle emits an `ALTER TYPE` migration.
//   3. Extend the `currency → symbol` map in the UI (see business-spec.md §7).
export const currencyEnum = pgEnum("currency_code", ["RUB"]);
export type Currency = (typeof currencyEnum.enumValues)[number];

// Individual expense record. Per docs/business-spec.md §4.2.
//
// Money is stored as INTEGER `amount_minor` (kopecks for RUB) — never floats.
// See CLAUDE.md "UI / язык" section.
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // RESTRICT — нельзя удалить категорию, к которой есть траты.
    // business-spec §5.3: «запрещаем удалять непустую категорию».
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: currencyEnum("currency").notNull().default("RUB"),
    note: text("note"),
    // App-level default to "today in user's timezone"; no DB default because
    // the timezone calculation lives in the app. Always set on insert.
    // Future-date validation is in the repository (zod).
    spentAt: date("spent_at", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("expenses_user_spent_idx").on(t.userId, t.spentAt.desc()),
    index("expenses_category_idx").on(t.categoryId),
    check("expenses_amount_positive", sql`${t.amountMinor} > 0`),
    check(
      "expenses_note_len",
      sql`${t.note} is null or char_length(${t.note}) <= 200`,
    ),
  ],
);
