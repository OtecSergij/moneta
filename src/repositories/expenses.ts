import { and, between, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import { accounts, categories, currencyEnum, expenses } from "@/db/schema";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";
import {
  type ConvertedTotal,
  type ConvertibleRow,
  type RateIndex,
  convertRow,
  sumConverted,
} from "@/lib/fx/convert";
import { maxEntryDate } from "@/lib/fx/provider";
import { isForeignKeyViolation } from "@/lib/db-errors";
import type { SpaceId } from "@/lib/space-id";
import { loadRateIndex } from "@/repositories/fx-rates";

// Shared by the form (react-hook-form + zod) and the repo.
//
// `spentAt` is a date string "YYYY-MM-DD" — `date` column type in `mode:
// "string"`. Its upper bound is checked in createExpense/updateExpense
// (spentAtIsValid), not here, because "today" depends on user's timezone.
//
// `currency` is constrained to the pg enum values from db/schema/expenses.ts,
// kept in sync with `CurrencyCode` (src/lib/currency.ts).
export const ExpenseInput = z.object({
  categoryId: z.uuid(),
  amountMinor: z.int().positive(),
  currency: z.enum(currencyEnum.enumValues),
  // Required: trimmed, non-empty, capped — mirrors the NOT NULL `note` column
  // and the form's "Добавьте описание" rule (business-spec §4.2).
  note: z.string().trim().min(1).max(EXPENSE_NOTE_MAX),
  spentAt: z.iso.date(),
  accountId: z.uuid().nullable().optional(),
});
export type ExpenseInput = z.infer<typeof ExpenseInput>;

export const ExpensePatch = ExpenseInput.partial();
export type ExpensePatch = z.infer<typeof ExpensePatch>;

export type Expense = typeof expenses.$inferSelect;

export type ExpenseWithConversion = Expense & {
  convertedMinor: number | null;
  displayCurrency: CurrencyCode;
};

export interface ListExpensesOpts {
  from?: string; // "YYYY-MM-DD" inclusive
  to?: string; // "YYYY-MM-DD" inclusive
  categoryId?: string;
  limit?: number;
}

// `display` sits ahead of `opts` because it is always required: behind a
// defaulted `opts` its default could never apply and every caller had to spell
// out `{}`. `index` lets a render that already loaded the rate history (the
// most expensive read in the request — see loadRateIndex) reuse it instead of
// repeating the query.
export async function listExpenses(
  spaceId: SpaceId,
  display: CurrencyCode,
  opts: ListExpensesOpts = {},
  index?: RateIndex,
): Promise<ExpenseWithConversion[]> {
  const conds = [eq(expenses.spaceId, spaceId)];
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

  const rows = opts.limit ? await q.limit(opts.limit) : await q;
  if (rows.length === 0) return [];

  // Bound taken from the rows actually fetched, not a default period — this
  // call has no date filter of its own (home screen: `{ limit: 10 }`), so a
  // default period would leave old rows without a rate to convert by.
  const rateIndex =
    index ??
    (await loadRateIndex(
      [...CURRENCY_CODES],
      rows.reduce((max, r) => (r.spentAt > max ? r.spentAt : max), rows[0].spentAt),
    ));

  return rows.map((row) => ({
    ...row,
    convertedMinor: convertRow(row, display, rateIndex),
    displayCurrency: display,
  }));
}

// Category of the most recent expense this user created in the space —
// pre-selects the quick-add form (business-spec §5.1). Personal: a partner's
// entries don't change it. Ordered by creation, not spending date, so a
// backdated entry doesn't change "last used". Null when there are none.
export async function lastUsedCategoryId(
  spaceId: SpaceId,
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({ categoryId: expenses.categoryId })
    .from(expenses)
    .where(and(eq(expenses.spaceId, spaceId), eq(expenses.createdBy, userId)))
    .orderBy(desc(expenses.createdAt))
    .limit(1);
  return rows[0]?.categoryId ?? null;
}

// Currency of the user's most recently created expense — same rationale as
// lastUsedCategoryId above. Null when there are no expenses; the caller
// falls back to the display currency (AC-4).
export async function lastUsedCurrency(
  spaceId: SpaceId,
  userId: string,
): Promise<CurrencyCode | null> {
  const rows = await db
    .select({ currency: expenses.currency })
    .from(expenses)
    .where(and(eq(expenses.spaceId, spaceId), eq(expenses.createdBy, userId)))
    .orderBy(desc(expenses.createdAt))
    .limit(1);
  return rows[0]?.currency ?? null;
}

// Account of the user's most recently created expense in the space. Null when
// that expense has no account — including one whose account was deleted
// (account_id is SET NULL).
export async function lastUsedAccountId(
  spaceId: SpaceId,
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({ accountId: expenses.accountId })
    .from(expenses)
    .where(and(eq(expenses.spaceId, spaceId), eq(expenses.createdBy, userId)))
    .orderBy(desc(expenses.createdAt))
    .limit(1);
  return rows[0]?.accountId ?? null;
}

export async function getExpense(
  spaceId: SpaceId,
  id: string,
): Promise<Expense | null> {
  const rows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.spaceId, spaceId)))
    .limit(1);
  return rows[0] ?? null;
}

// The composite FK (category_id, space_id) would reject a foreign category too;
// checking first turns the common case into a plain null instead of a 23503.
async function categoryInSpace(
  spaceId: SpaceId,
  categoryId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.spaceId, spaceId)))
    .limit(1);
  return rows.length > 0;
}

async function accountAccepts(
  spaceId: SpaceId,
  accountId: string,
  currency: CurrencyCode,
  executor: DbExecutor = db,
): Promise<boolean> {
  const [account] = await executor
    .select({ currency: accounts.currency })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.spaceId, spaceId)))
    .limit(1);
  if (account?.currency === currency) return true;
  console.info("expense.account_rejected", { spaceId, accountId });
  return false;
}

// Upper bound on the entry date. The old rationale for leaving this to the UI
// was that "today" depends on the user's timezone; maxEntryDate() now answers
// that by allowing the client to be one day ahead of this server, so the
// bound can be enforced here too. Deliberately no lower bound:
// PROVIDER_HISTORY_FLOOR limits which rates exist, not which expenses may be
// recorded — an older one is simply shown unconverted.
function spentAtIsValid(spentAt: string): boolean {
  return spentAt <= maxEntryDate();
}

export async function createExpense(
  spaceId: SpaceId,
  userId: string,
  input: ExpenseInput,
): Promise<Expense | null> {
  if (!(await categoryInSpace(spaceId, input.categoryId))) return null;
  if (!spentAtIsValid(input.spentAt)) return null;
  if (input.accountId && !(await accountAccepts(spaceId, input.accountId, input.currency))) {
    return null;
  }

  try {
    const [row] = await db
      .insert(expenses)
      .values({
        spaceId,
        createdBy: userId,
        categoryId: input.categoryId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        note: input.note,
        spentAt: input.spentAt,
        accountId: input.accountId ?? null,
      })
      .returning();
    return row;
  } catch (err) {
    if (isForeignKeyViolation(err)) return null;
    throw err;
  }
}

export async function updateExpense(
  spaceId: SpaceId,
  id: string,
  patch: ExpensePatch,
): Promise<Expense | null> {
  if (Object.keys(patch).length === 0) {
    return getExpense(spaceId, id);
  }

  if (patch.categoryId && !(await categoryInSpace(spaceId, patch.categoryId))) {
    return null;
  }
  if (patch.spentAt !== undefined && !spentAtIsValid(patch.spentAt)) {
    return null;
  }
  const where = and(eq(expenses.id, id), eq(expenses.spaceId, spaceId));

  try {
    return await db.transaction(async (tx) => {
      // Locked so a concurrent patch of the other half of the account/currency
      // pair is checked against this one's result, not the row before it.
      if (patch.accountId !== undefined || patch.currency !== undefined) {
        const [current] = await tx.select().from(expenses).where(where).for("update");
        if (!current) return null;
        const accountId = patch.accountId === undefined ? current.accountId : patch.accountId;
        const currency = patch.currency ?? current.currency;
        if (accountId && !(await accountAccepts(spaceId, accountId, currency, tx))) {
          return null;
        }
      }
      const [updated] = await tx.update(expenses).set(patch).where(where).returning();
      return updated ?? null;
    });
  } catch (err) {
    if (isForeignKeyViolation(err)) return null;
    throw err;
  }
}

export async function deleteExpense(
  spaceId: SpaceId,
  id: string,
): Promise<{ ok: boolean }> {
  const deleted = await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.spaceId, spaceId)))
    .returning({ id: expenses.id });
  return { ok: deleted.length > 0 };
}

// Aggregated view for the home/history screens: per-category totals over a
// date range, plus the grand total. Per business-spec §5.1.
//
// `unconverted` counts the rows no rate could value. They are missing from the
// total, so it is short by real money — the UI marks a total carrying one
// rather than presenting it as exact (a category whose rows are all
// unconverted would otherwise read as a plain, believable «0 ₽»).
export interface SummaryRow extends ConvertedTotal {
  categoryId: string;
  name: string;
  color: string;
}

export interface Summary extends ConvertedTotal {
  byCategory: SummaryRow[];
}

export async function summary(
  spaceId: SpaceId,
  display: CurrencyCode,
  opts: { from: string; to: string },
  index?: RateIndex,
): Promise<Summary> {
  const rows = await db
    .select({
      categoryId: categories.id,
      name: categories.name,
      color: categories.color,
      amountMinor: expenses.amountMinor,
      currency: expenses.currency,
      spentAt: expenses.spentAt,
    })
    .from(expenses)
    .innerJoin(categories, eq(expenses.categoryId, categories.id))
    .where(
      and(
        eq(expenses.spaceId, spaceId),
        between(expenses.spentAt, opts.from, opts.to),
      ),
    );

  if (rows.length === 0) {
    return { totalMinor: 0, unconverted: 0, byCategory: [] };
  }

  const rateIndex =
    index ?? (await loadRateIndex([...CURRENCY_CODES], opts.to));

  // Grouped and totaled in TS, not SQL: a raw `sum(...)::int` returns
  // `numeric`/`bigint` as a string once the `::int` cast is dropped, and a
  // per-row currency conversion has no single SQL-side rounding rule anyway
  // (plan Step 5.5, ADR).
  const byCategoryId = new Map<
    string,
    { name: string; color: string; rows: ConvertibleRow[] }
  >();
  for (const row of rows) {
    let group = byCategoryId.get(row.categoryId);
    if (!group) {
      group = { name: row.name, color: row.color, rows: [] };
      byCategoryId.set(row.categoryId, group);
    }
    group.rows.push(row);
  }

  const byCategory = Array.from(byCategoryId.entries()).map(
    ([categoryId, group]) => ({
      categoryId,
      name: group.name,
      color: group.color,
      ...sumConverted(group.rows, display, rateIndex),
    }),
  );
  byCategory.sort((a, b) => b.totalMinor - a.totalMinor);

  return { ...sumConverted(rows, display, rateIndex), byCategory };
}
