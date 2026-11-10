import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { LIST_VISIBILITIES } from "../../lib/lists";
import { user } from "./auth";
import { spaces } from "./spaces";

export const listVisibilityEnum = pgEnum("list_visibility", LIST_VISIBILITIES);

export const lists = pgTable(
  "lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    visibility: listVisibilityEnum("visibility").notNull().default("shared"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("lists_id_space_uniq").on(t.id, t.spaceId),
    index("lists_space_updated_idx").on(t.spaceId, t.updatedAt.desc()),
    check("lists_name_len", sql`char_length(trim(${t.name})) between 1 and 60`),
  ],
);

export const listItems = pgTable(
  "list_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id").notNull(),
    spaceId: uuid("space_id").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    text: text("text").notNull(),
    checked: boolean("checked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "list_items_list_same_space_fk",
      columns: [t.listId, t.spaceId],
      foreignColumns: [lists.id, lists.spaceId],
    }).onDelete("cascade"),
    index("list_items_list_checked_created_idx").on(
      t.listId,
      t.checked,
      t.createdAt,
    ),
    check(
      "list_items_text_len",
      sql`char_length(trim(${t.text})) between 1 and 200`,
    ),
  ],
);
