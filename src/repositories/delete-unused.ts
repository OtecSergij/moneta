import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, expenses } from "@/db/schema";
import { isForeignKeyViolation } from "@/lib/db-errors";
import type { SpaceId } from "@/lib/space-id";

export type DeleteUnusedResult =
  | { ok: true }
  | { ok: false; reason: "has_expenses" | "not_found" };

// Only a row no expense points at can be deleted. The check gives the clean
// answer; the FK-violation catch covers an expense added in between.
export async function deleteWithoutExpenses(
  spaceId: SpaceId,
  id: string,
  table: typeof accounts | typeof categories,
  expenseRef: typeof expenses.accountId | typeof expenses.categoryId,
): Promise<DeleteUnusedResult> {
  const used = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.spaceId, spaceId), eq(expenseRef, id)))
    .limit(1);
  if (used.length > 0) return { ok: false, reason: "has_expenses" };
  try {
    const rows = await db
      .delete(table)
      .where(and(eq(table.id, id), eq(table.spaceId, spaceId)))
      .returning({ id: table.id });
    if (rows.length === 0) return { ok: false, reason: "not_found" };
    return { ok: true };
  } catch (err) {
    if (isForeignKeyViolation(err)) return { ok: false, reason: "has_expenses" };
    throw err;
  }
}
