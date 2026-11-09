import { sql } from "drizzle-orm";
import {
  check,
  date,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { currencyEnum } from "./expenses";

// Daily USD-referenced exchange rate snapshots. Global table, no user_id:
// a rate for a given (currency, date) is the same for every user, so one
// row serves everyone instead of refetching/storing it per account.
export const fxRates = pgTable(
  "fx_rates",
  {
    currency: currencyEnum("currency").notNull(),
    effectiveDate: date("effective_date", { mode: "string" }).notNull(),
    // Scale 1e20 — see src/lib/fx/convert.ts for the conversion math.
    rateToUsd: numeric("rate_to_usd", { precision: 36, scale: 20 }).notNull(),
    source: text("source").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.currency, t.effectiveDate] }),
    // BigInt division by a zero/negative rate throws RangeError and would
    // crash rendering (convert.ts divides by rateTo).
    check("fx_rates_rate_positive", sql`${t.rateToUsd} > 0`),
  ],
);
