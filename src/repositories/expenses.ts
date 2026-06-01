import { and, between, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categories, currencyEnum, expenses } from "@/db/schema";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";

// Shared by the form (react-hook-form + zod) and the repo.
//
// `spentAt` is a date string "YYYY-MM-DD" — `date` column type in `mode:
// "string"`. "Not in the future" check lives in the UI (date-picker max),
// not here, because "today" depends on user's timezone.
//
// `currency` is constrained to the pg enum values from db/schema/expenses.ts.
// MVP is single-value ['RUB']; extend the schema's pgEnum + this zod enum
// together when adding more.
export const ExpenseInput = z.object({
  categoryId: z.uuid(),
  amountMinor: z.int().positive(),
  currency: z.enum(currencyEnum.enumValues).default("RUB"),
  // Empty/blank → null (NOT undefined) so an UPDATE actually clears the column:
  // Drizzle's update-set drops undefined keys (= "don't touch") but keeps null
  // (= SET note = NULL). .optional() keeps the key optional for direct callers
  // that omit note entirely (e.g. repository tests).
  note: z
    .string()
    .max(EXPENSE_NOTE_MAX)
    .transform((v) => (v.trim().length > 0 ? v.trim() : null))
    .optional(),
  spentAt: z.iso.date(),
});
export type ExpenseInput = z.infer<typeof ExpenseInput>;

export const ExpensePatch = ExpenseInput.partial();
export type ExpensePatch = z.infer<typeof ExpensePatch>;

export type Expense = typeof expenses.$inferSelect;

export interface ListExpensesOpts {
  from?: string; // "YYYY-MM-DD" inclusive
  to?: string; // "YYYY-MM-DD" inclusive
  categoryId?: string;
  limit?: number;
}

export async function listExpenses(
  userId: string,
  opts: ListExpensesOpts = {},
): Promise<Expense[]> {
  const conds = [eq(expenses.userId, userId)];
  if (opts.from && opts.to) {
    conds.push(between(expenses.spentAt, opts.from, opts.to));
  } else if (opts.from) {
    conds.push(sql`${expenses.spentAt} >= ${opts.from}`);
  } else if (opts.to) {
    conds.push(sql`${expenses.spentAt} <= ${opts.to}`);
  }
  if (opts.categoryId) {
    conds.push(eq(expenses.categoryId, opts.categoryId));
  }

  const q = db
    .select()
    .from(expenses)
    .where(and(...conds))
    .orderBy(desc(expenses.spentAt), desc(expenses.createdAt));

  return opts.limit ? await q.limit(opts.limit) : await q;
}

export async function getExpense(
  userId: string,
  id: string,
): Promise<Expense | null> {
  const rows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

// Verifies the category belongs to the same user before inserting. Without
// this check a malicious caller could attach an expense to someone else's
// category (FK alone enforces existence, not ownership).
async function userOwnsCategory(
  userId: string,
  categoryId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function createExpense(
  userId: string,
  input: ExpenseInput,
): Promise<Expense | null> {
  if (!(await userOwnsCategory(userId, input.categoryId))) return null;

  const [row] = await db
    .insert(expenses)
    .values({
      userId,
      categoryId: input.categoryId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      note: input.note,
      spentAt: input.spentAt,
    })
    .returning();
  return row;
}

export async function updateExpense(
  userId: string,
  id: string,
  patch: ExpensePatch,
): Promise<Expense | null> {
  if (Object.keys(patch).length === 0) {
    return getExpense(userId, id);
  }
  // If reassigning the category, verify the new one belongs to the user.
  if (patch.categoryId && !(await userOwnsCategory(userId, patch.categoryId))) {
    return null;
  }
  const [row] = await db
    .update(expenses)
    .set(patch)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteExpense(
  userId: string,
  id: string,
): Promise<{ ok: boolean }> {
  const deleted = await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .returning({ id: expenses.id });
  return { ok: deleted.length > 0 };
}

// Aggregated view for the home/history screens: per-category totals over a
// date range, plus the grand total. Per business-spec §5.1.
export interface SummaryRow {
  categoryId: string;
  name: string;
  color: string;
  totalMinor: number;
}

export interface Summary {
  totalMinor: number;
  byCategory: SummaryRow[];
}

export async function summary(
  userId: string,
  opts: { from: string; to: string },
): Promise<Summary> {
  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      color: categories.color,
      totalMinor: sql<number>`sum(${expenses.amountMinor})::int`,
    })
    .from(expenses)
    .innerJoin(categories, eq(expenses.categoryId, categories.id))
    .where(
      and(
        eq(expenses.userId, userId),
        between(expenses.spentAt, opts.from, opts.to),
      ),
    )
    .groupBy(categories.id, categories.name, categories.color)
    .orderBy(desc(sql`sum(${expenses.amountMinor})`));

  const totalMinor = rows.reduce((sum, r) => sum + r.totalMinor, 0);
  return { totalMinor, byCategory: rows };
}
