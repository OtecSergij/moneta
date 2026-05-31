import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, expenses } from "@/db/schema";
import {
  CATEGORY_COLORS,
  CategoryInput,
  CategoryPatch,
  type CategoryColor,
} from "@/lib/categories";

// Re-exported from the DB-free @/lib/categories (which client components import
// too) so server-side call sites can keep importing from the repository.
export { CATEGORY_COLORS, CategoryInput, CategoryPatch };
export type { CategoryColor };

export type Category = typeof categories.$inferSelect;

export async function listCategories(userId: string): Promise<Category[]> {
  return await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.name));
}

export async function getCategory(
  userId: string,
  id: string,
): Promise<Category | null> {
  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createCategory(
  userId: string,
  input: CategoryInput,
): Promise<Category> {
  const [row] = await db
    .insert(categories)
    .values({
      userId,
      name: input.name,
      description: input.description,
      color: input.color,
    })
    .returning();
  return row;
}

export async function updateCategory(
  userId: string,
  id: string,
  patch: CategoryPatch,
): Promise<Category | null> {
  // No-op patch — short-circuit to avoid `SET ` syntax error.
  if (Object.keys(patch).length === 0) {
    return getCategory(userId, id);
  }
  const [row] = await db
    .update(categories)
    .set(patch)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .returning();
  return row ?? null;
}

export type DeleteCategoryResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "has_expenses" };

export async function deleteCategory(
  userId: string,
  id: string,
): Promise<DeleteCategoryResult> {
  // Per business-spec §5.3: can only delete an empty category. Check
  // proactively rather than catching the FK violation — gives a cleaner
  // reason in the response.
  const expenseCount = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.userId, userId), eq(expenses.categoryId, id)))
    .limit(1);
  if (expenseCount.length > 0) {
    return { ok: false, reason: "has_expenses" };
  }
  const deleted = await db
    .delete(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .returning({ id: categories.id });
  if (deleted.length === 0) {
    return { ok: false, reason: "not_found" };
  }
  return { ok: true };
}
