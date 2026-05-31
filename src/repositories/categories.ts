import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categories, expenses } from "@/db/schema";

// 15-color palette from design-system/moneta/MASTER.md "Category colours".
// Keep in sync with the picker UI.
export const CATEGORY_COLORS = [
  "#EF4444", // Red
  "#F97316", // Orange
  "#F59E0B", // Amber
  "#EAB308", // Yellow
  "#84CC16", // Lime
  "#10B981", // Green
  "#14B8A6", // Teal
  "#06B6D4", // Cyan
  "#3B82F6", // Blue
  "#6366F1", // Indigo
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#F43F5E", // Rose
  "#A16207", // Brown
  "#64748B", // Slate
] as const;

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

// Shared by the create-form (react-hook-form + zod) and the repo. Single
// source of truth.
export const CategoryInput = z.object({
  name: z.string().trim().min(1).max(40),
  // .optional() must wrap .transform() (be outermost) so the inferred key is
  // optional (`description?`), not a required key valued `string | undefined`.
  description: z
    .string()
    .max(250)
    .transform((v) => (v.trim().length > 0 ? v : undefined))
    .optional(),
  color: z.enum(CATEGORY_COLORS),
});
export type CategoryInput = z.infer<typeof CategoryInput>;

export const CategoryPatch = CategoryInput.partial();
export type CategoryPatch = z.infer<typeof CategoryPatch>;

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
