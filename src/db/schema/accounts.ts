import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { currencyEnum } from "./expenses";
import { spaces } from "./spaces";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    currency: currencyEnum("currency").notNull(),
    anchorAmountMinor: bigint("anchor_amount_minor", { mode: "number" }).notNull(),
    anchorAt: timestamp("anchor_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("accounts_space_name_uniq").on(t.spaceId, t.name),
    index("accounts_space_idx").on(t.spaceId),
    check(
      "accounts_name_len",
      sql`char_length(trim(${t.name})) between 1 and 40`,
    ),
    check("accounts_anchor_nonneg", sql`${t.anchorAmountMinor} >= 0`),
  ],
);
