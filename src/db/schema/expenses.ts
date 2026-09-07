import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { CURRENCY_CODES } from "../../lib/currency";
import { user } from "./auth";
import { categories } from "./categories";

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
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // RESTRICT — нельзя удалить категорию, к которой есть траты.
    // business-spec §5.3: «запрещаем удалять непустую категорию».
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    // BIGINT, not INTEGER: BTC's 8-decimal exponent puts 21M BTC at
    // 2.1e15 satoshis, above INTEGER's ~2.1e9 ceiling. `number` mode is
    // exact up to 2^53 (drizzle-orm/pg-core/columns/bigint.js), well above
    // that ceiling, and only applies to column references, not raw `sql<>`
    // fragments (see plan Step 2.2).
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: currencyEnum("currency").notNull().default("RUB"),
    // Frozen conversion rate for this row, scale 1e20 (matches
    // fx_rates.rate_to_usd). NULL unless rate_source is set — see the
    // pairing CHECK below. Meaning depends on the source: 'user' is a cache
    // derived from charged_amount_minor/charged_currency, recomputed
    // whenever an input to that derivation changes; 'coinbase' is the live
    // BTC quote itself, frozen forever because Coinbase has no historical
    // endpoint to recompute it from (see src/lib/fx/convert.ts and plan
    // Step 5.3 for the update-time freeze rules).
    rateToUsdOverride: numeric("rate_to_usd_override", {
      precision: 36,
      scale: 20,
    }),
    rateSource: text("rate_source"),
    // What the user says was actually charged (e.g. a card's own RUB
    // conversion of a USD purchase) — rate_to_usd_override is derived from
    // this pair when rate_source = 'user'.
    chargedAmountMinor: bigint("charged_amount_minor", { mode: "number" }),
    chargedCurrency: currencyEnum("charged_currency"),
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
    index("expenses_user_spent_idx").on(t.userId, t.spentAt.desc()),
    index("expenses_category_idx").on(t.categoryId),
    check("expenses_amount_positive", sql`${t.amountMinor} > 0`),
    check(
      "expenses_note_len",
      sql`char_length(${t.note}) between 1 and 200`,
    ),
    // Pairs: an override rate can't exist without a source, and a manual
    // charge fixation can't exist as only half a pair.
    check(
      "expenses_rate_override_pair",
      sql`(${t.rateToUsdOverride} is null) = (${t.rateSource} is null)`,
    ),
    check(
      "expenses_charged_pair",
      sql`(${t.chargedAmountMinor} is null) = (${t.chargedCurrency} is null)`,
    ),
    check(
      "expenses_charged_amount_positive",
      sql`${t.chargedAmountMinor} is null or ${t.chargedAmountMinor} > 0`,
    ),
    check(
      "expenses_rate_override_positive",
      sql`${t.rateToUsdOverride} is null or ${t.rateToUsdOverride} > 0`,
    ),
    check(
      "expenses_rate_source_values",
      sql`${t.rateSource} is null or ${t.rateSource} in ('user', 'coinbase')`,
    ),
    // A 'user'-derived rate can't outlive the fixation it's derived from:
    // that row would be unexplainable and unclearable from the UI (plan
    // Step 2.3, pre-mortem "осиротевший курс").
    check(
      "expenses_rate_source_requires_charged",
      sql`${t.rateSource} is distinct from 'user' or ${t.chargedAmountMinor} is not null`,
    ),
    // Fixing the charge in the expense's own currency is meaningless and
    // would collide with convert.ts's rule order (identity vs. override
    // both claiming the same row — plan Step 3.3).
    check(
      "expenses_charged_currency_differs",
      sql`${t.chargedCurrency} is null or ${t.chargedCurrency} <> ${t.currency}`,
    ),
  ],
);
