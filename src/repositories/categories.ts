import { and, asc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, expenses } from "@/db/schema";
import {
  CATEGORY_COLORS,
  CategoryInput,
  CategoryPatch,
  firstFreeColor,
  type CategoryColor,
} from "@/lib/categories";
import { isForeignKeyViolation } from "@/lib/db-errors";
import type { SpaceId } from "@/lib/space-id";

// Re-exported from the DB-free @/lib/categories (which client components import
// too) so server-side call sites can keep importing from the repository.
export { CATEGORY_COLORS, CategoryInput, CategoryPatch };
export type { CategoryColor };

export type Category = typeof categories.$inferSelect;
export type CategoryWithUsage = Category & { hasExpenses: boolean };

export type NewCategory = Omit<CategoryInput, "color"> & {
  color?: CategoryColor;
};

export async function listCategories(
  spaceId: SpaceId,
): Promise<CategoryWithUsage[]> {
  return await db
    .select({
      ...getTableColumns(categories),
      // Spelled out: drizzle leaves column refs unqualified in a single-table
      // select, so `${categories.id}` would bind to expenses.id here.
      hasExpenses: sql<boolean>`exists (select 1 from "expenses" where "expenses"."category_id" = "categories"."id")`,
    })
    .from(categories)
    .where(eq(categories.spaceId, spaceId))
    .orderBy(asc(categories.name));
}

export async function getCategory(
  spaceId: SpaceId,
  id: string,
): Promise<Category | null> {
  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.spaceId, spaceId)))
    .limit(1);
  return rows[0] ?? null;
}

async function freeColorInSpace(spaceId: SpaceId): Promise<CategoryColor> {
  const rows = await db
    .select({ color: categories.color })
    .from(categories)
    .where(eq(categories.spaceId, spaceId));
  return firstFreeColor(rows.map((r) => r.color));
}

export async function createCategory(
  spaceId: SpaceId,
  userId: string,
  input: NewCategory,
): Promise<Category> {
  const [row] = await db
    .insert(categories)
    .values({
      spaceId,
      createdBy: userId,
      name: input.name,
      description: input.description,
      color: input.color ?? (await freeColorInSpace(spaceId)),
    })
    .returning();
  return row;
}

export async function updateCategory(
  spaceId: SpaceId,
  id: string,
  patch: CategoryPatch,
): Promise<Category | null> {
  // No-op patch — short-circuit to avoid `SET ` syntax error.
  if (Object.keys(patch).length === 0) {
    return getCategory(spaceId, id);
  }
  const [row] = await db
    .update(categories)
    .set(patch)
    .where(and(eq(categories.id, id), eq(categories.spaceId, spaceId)))
    .returning();
  return row ?? null;
}

export type DeleteCategoryResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "has_expenses" };

export async function deleteCategory(
  spaceId: SpaceId,
  id: string,
): Promise<DeleteCategoryResult> {
  // Business-spec §5.3: only an empty category can be deleted. The check gives
  // the clean answer; the 23503 catch covers an expense added in between.
  const used = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.spaceId, spaceId), eq(expenses.categoryId, id)))
    .limit(1);
  if (used.length > 0) {
    return { ok: false, reason: "has_expenses" };
  }
  try {
    const deleted = await db
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.spaceId, spaceId)))
      .returning({ id: categories.id });
    if (deleted.length === 0) {
      return { ok: false, reason: "not_found" };
    }
    return { ok: true };
  } catch (err) {
    if (isForeignKeyViolation(err)) {
      return { ok: false, reason: "has_expenses" };
    }
    throw err;
  }
}
