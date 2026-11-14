import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { currencyEnum } from "./expenses";

// Per-user preferences — one row per user, created lazily on first save.
export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    // Currency all aggregates and lists render in;
    // switching it doesn't touch any expenses row, only how it's summed.
    displayCurrency: currencyEnum("display_currency")
      .notNull()
      .default("RUB"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);
