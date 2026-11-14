import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, expenses } from "@/db/schema";
import { CategoryInput, CategoryPatch } from "@/lib/categories";
import { firstFreeColor, type PaletteColor } from "@/lib/palette";
import type { SpaceId } from "@/lib/space-id";
import { deleteWithoutExpenses, type DeleteUnusedResult } from "./delete-unused";

// Re-exported from the DB-free @/lib/categories (which client components import
// too) so server-side call sites can keep importing from the repository.
export { CategoryInput, CategoryPatch };

export type Category = typeof categories.$inferSelect;
export type ExpenseCategory = Pick<Category, "id" | "name" | "color">;
export type CategoryWithUsage = ExpenseCategory & { hasExpenses: boolean };

type NewCategory = Omit<CategoryInput, "color"> & {
  color?: PaletteColor;
};

const expenseCategory = {
  id: categories.id,
  name: categories.name,
  color: categories.color,
};

export async function listCategories(
  spaceId: SpaceId,
): Promise<ExpenseCategory[]> {
  return await db
    .select(expenseCategory)
    .from(categories)
    .where(eq(categories.spaceId, spaceId))
    .orderBy(asc(categories.createdAt), asc(categories.id));
}

export async function listCategoriesWithUsage(
  spaceId: SpaceId,
): Promise<CategoryWithUsage[]> {
  return await db
    .select({
      ...expenseCategory,
      // Spelled out: drizzle leaves column refs unqualified in a single-table
      // select, so `${categories.id}` would bind to expenses.id here.
      hasExpenses: sql<boolean>`exists (select 1 from "expenses" where "expenses"."category_id" = "categories"."id")`,
    })
    .from(categories)
    .where(eq(categories.spaceId, spaceId))
    .orderBy(asc(categories.createdAt), asc(categories.id));
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

async function freeColorInSpace(spaceId: SpaceId): Promise<PaletteColor> {
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
  if (Object.values(patch).every((v) => v === undefined)) {
    return getCategory(spaceId, id);
  }
  const [row] = await db
    .update(categories)
    .set(patch)
    .where(and(eq(categories.id, id), eq(categories.spaceId, spaceId)))
    .returning();
  return row ?? null;
}

export async function deleteCategory(
  spaceId: SpaceId,
  id: string,
): Promise<DeleteUnusedResult> {
  return deleteWithoutExpenses(spaceId, id, categories, expenses.categoryId);
}
