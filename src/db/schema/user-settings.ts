import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

// Per-user preferences — one row per user, created lazily on first save.
// MVP holds only salary days: calendar days of the month (e.g. 3 and 17) that
// drive the History "с последней зарплаты" preset (business-spec §5.3). Future
// scalar settings land here too, so the table is named generically.
export const userSettings = pgTable(
  "user_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    // Days of the month (1–31), sorted ascending, de-duplicated. Empty array =
    // not configured (the preset is then hidden). The sort/dedupe is enforced
    // in the app layer (zod); the check below pins every element to 1–31.
    salaryDays: integer("salary_days")
      .array()
      .notNull()
      .default(sql`'{}'::integer[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "user_settings_salary_days_range",
      sql`${t.salaryDays} <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31}'::integer[]`,
    ),
  ],
);
