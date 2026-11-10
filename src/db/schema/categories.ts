import { sql } from "drizzle-orm";
import {
  check,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { spaces } from "./spaces";

// User-defined spending category (e.g. "Еда", "Транспорт", "Кафе").
// Per docs/business-spec.md §4.1.
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    // 15-color palette is defined in design-system/moneta/MASTER.md; we
    // store the hex itself and validate palette membership in the form
    // layer (zod). DB just enforces hex format.
    color: text("color").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("categories_space_name_uniq").on(t.spaceId, t.name),
    unique("categories_id_space_uniq").on(t.id, t.spaceId),
    check(
      "categories_name_len",
      sql`char_length(trim(${t.name})) between 1 and 40`,
    ),
    check(
      "categories_description_len",
      sql`${t.description} is null or char_length(${t.description}) <= 250`,
    ),
    check("categories_color_hex", sql`${t.color} ~ '^#[0-9A-Fa-f]{6}$'`),
  ],
);
