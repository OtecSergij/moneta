import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts";
import { user } from "./auth";
import { spaces } from "./spaces";

// Money moved from one account of a space to another. No currency columns:
// each amount is in the currency of the account on its place. Deleting an
// account empties its place; a row with both places empty is deleted by the
// trigger in migration 0016_transfers_orphan_cleanup.
export const transfers = pgTable(
  "transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    fromAccountId: uuid("from_account_id"),
    toAccountId: uuid("to_account_id"),
    fromAmountMinor: bigint("from_amount_minor", { mode: "number" }).notNull(),
    toAmountMinor: bigint("to_amount_minor", { mode: "number" }).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    enteredOn: date("entered_on", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("transfers_from_created_idx").on(t.fromAccountId, t.createdAt),
    index("transfers_to_created_idx").on(t.toAccountId, t.createdAt),
    // Both FKs are SET NULL ("<own column>") in 0015_transfers.sql, edited by
    // hand: drizzle can't express the column list, and a plain SET NULL would
    // also null space_id. A future migration recreating these FKs must repeat it.
    foreignKey({
      name: "transfers_from_same_space_fk",
      columns: [t.fromAccountId, t.spaceId],
      foreignColumns: [accounts.id, accounts.spaceId],
    }).onDelete("set null"),
    foreignKey({
      name: "transfers_to_same_space_fk",
      columns: [t.toAccountId, t.spaceId],
      foreignColumns: [accounts.id, accounts.spaceId],
    }).onDelete("set null"),
    check(
      "transfers_amounts_positive",
      sql`${t.fromAmountMinor} > 0 and ${t.toAmountMinor} > 0`,
    ),
    check(
      "transfers_distinct_accounts",
      sql`${t.fromAccountId} <> ${t.toAccountId}`,
    ),
  ],
);
