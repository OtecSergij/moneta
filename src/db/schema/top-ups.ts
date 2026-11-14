import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { user } from "./auth";
import { spaces } from "./spaces";

// Money added to an account. No currency column: a top-up is always in its
// account's currency.
export const topUps = pgTable(
  "top_ups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    note: text("note").notNull(),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("top_ups_account_created_idx").on(t.accountId, t.createdAt),
    foreignKey({
      name: "top_ups_account_same_space_fk",
      columns: [t.accountId, t.spaceId],
      foreignColumns: [accounts.id, accounts.spaceId],
    }).onDelete("cascade"),
    check("top_ups_amount_positive", sql`${t.amountMinor} > 0`),
    check("top_ups_note_len", sql`char_length(${t.note}) between 1 and 200`),
  ],
);
