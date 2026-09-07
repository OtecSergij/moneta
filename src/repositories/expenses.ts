import { and, between, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categories, currencyEnum, expenses } from "@/db/schema";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";
import {
  type ConvertedTotal,
  type ConvertibleRow,
  type RateIndex,
  convertRow,
  sumConverted,
} from "@/lib/fx/convert";
import {
  type FxDeps,
  fetchLiveBtcUsd,
  isCurrentDate,
  maxEntryDate,
} from "@/lib/fx/provider";
import {
  FOREGROUND_RATE_BUDGET_MS,
  deriveOverrideForFixation,
  ensureRates,
  loadRateIndex,
} from "@/repositories/fx-rates";

// A thunk, not a captured reference: `{ fetch: globalThis.fetch }` would
// bind globalThis.fetch once at module import time, so a test reassigning
// the global afterwards (vi.fn stubbing) would have no effect on calls that
// fall back to this default. Deferring the lookup into the wrapper reads
// globalThis.fetch fresh on every call.
const defaultDeps: FxDeps = { fetch: (...args) => globalThis.fetch(...args) };

// Shared by the form (react-hook-form + zod) and the repo.
//
// `spentAt` is a date string "YYYY-MM-DD" — `date` column type in `mode:
// "string"`. "Not in the future" check lives in the UI (date-picker max),
// not here, because "today" depends on user's timezone.
//
// `currency` is constrained to the pg enum values from db/schema/expenses.ts,
// kept in sync with `CurrencyCode` (src/lib/currency.ts).
//
// `chargedAmountMinor`/`chargedCurrency` use `.nullable().optional()`, not
// plain `.optional()`: drizzle's `.set(patch)` strips `undefined` keys, so
// only an explicit `null` can clear a saved fixation.
export const ExpenseInput = z.object({
  categoryId: z.uuid(),
  amountMinor: z.int().positive(),
  currency: z.enum(currencyEnum.enumValues),
  chargedAmountMinor: z.int().positive().nullable().optional(),
  chargedCurrency: z.enum(currencyEnum.enumValues).nullable().optional(),
  // Required: trimmed, non-empty, capped — mirrors the NOT NULL `note` column
  // and the form's "Добавьте описание" rule (business-spec §4.2).
  note: z.string().trim().min(1).max(EXPENSE_NOTE_MAX),
  spentAt: z.iso.date(),
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
  userId: string,
  display: CurrencyCode,
  opts: ListExpensesOpts = {},
  index?: RateIndex,
): Promise<ExpenseWithConversion[]> {
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

// Category of the user's most recently created expense — pre-selects the
// quick-add form so adding several similar expenses doesn't require re-picking
// the category (business-spec §5.1). Ordered by creation, not spending date, so
// a backdated entry doesn't change "last used". Null when there are no expenses.
export async function lastUsedCategoryId(
  userId: string,
): Promise<string | null> {
  const rows = await db
    .select({ categoryId: expenses.categoryId })
    .from(expenses)
    .where(eq(expenses.userId, userId))
    .orderBy(desc(expenses.createdAt))
    .limit(1);
  return rows[0]?.categoryId ?? null;
}

// Currency of the user's most recently created expense — same rationale as
// lastUsedCategoryId above. Null when there are no expenses; the caller
// falls back to the display currency (AC-4).
export async function lastUsedCurrency(
  userId: string,
): Promise<CurrencyCode | null> {
  const rows = await db
    .select({ currency: expenses.currency })
    .from(expenses)
    .where(eq(expenses.userId, userId))
    .orderBy(desc(expenses.createdAt))
    .limit(1);
  return rows[0]?.currency ?? null;
}

// Charged currency of the user's most recently created expense that carries a
// fixation — same rationale as lastUsedCurrency above, but it deliberately
// skips rows without a fixation: the card a payment lands on doesn't change
// just because the next few expenses were entered without recording what was
// debited. Null when the user has never recorded one.
export async function lastUsedChargedCurrency(
  userId: string,
): Promise<CurrencyCode | null> {
  const rows = await db
    .select({ chargedCurrency: expenses.chargedCurrency })
    .from(expenses)
    .where(
      and(eq(expenses.userId, userId), isNotNull(expenses.chargedCurrency)),
    )
    .orderBy(desc(expenses.createdAt))
    .limit(1);
  return rows[0]?.chargedCurrency ?? null;
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

// Upper bound on the entry date. The old rationale for leaving this to the UI
// was that "today" depends on the user's timezone; maxEntryDate() now answers
// that by allowing the client to be one day ahead of this server, so the
// bound can be enforced here too. Without it a direct POST could freeze a
// live BTC rate onto a fabricated future date, which nothing could correct
// later (a 'coinbase' rate is never re-derived). Deliberately no lower
// bound: PROVIDER_HISTORY_FLOOR limits which rates exist, not which
// expenses may be recorded — an older one is simply shown unconverted.
function spentAtIsValid(spentAt: string): boolean {
  return spentAt <= maxEntryDate();
}

// Mirrors the two paired CHECK constraints (expenses_charged_pair,
// expenses_charged_currency_differs — db/schema/expenses.ts) against the
// EFFECTIVE values: ExpenseInput/ExpensePatch validate the two charged
// fields independently, so a direct POST setting only one of them, or
// setting chargedCurrency equal to currency, passes zod and would otherwise
// only be caught by an unhandled Postgres CHECK violation (500).
function chargedPairIsValid(
  currency: CurrencyCode,
  chargedAmountMinor: number | null,
  chargedCurrency: CurrencyCode | null,
): boolean {
  if ((chargedAmountMinor === null) !== (chargedCurrency === null)) {
    return false;
  }
  return chargedCurrency === null || chargedCurrency !== currency;
}

export async function createExpense(
  userId: string,
  input: ExpenseInput,
  deps: FxDeps = defaultDeps,
): Promise<Expense | null> {
  if (!(await userOwnsCategory(userId, input.categoryId))) return null;
  if (!spentAtIsValid(input.spentAt)) return null;
  if (
    !chargedPairIsValid(
      input.currency,
      input.chargedAmountMinor ?? null,
      input.chargedCurrency ?? null,
    )
  ) {
    return null;
  }

  let rateToUsdOverride: string | null = null;
  let rateSource: "user" | "coinbase" | null = null;

  if (input.chargedAmountMinor != null && input.chargedCurrency != null) {
    // Only this path reads fx_rates, so only it waits for the snapshot; the
    // plain single-currency path defers ensureRates to the action's after()
    // (plan Step 5.2/5.8). Budgeted, because the wait is on the user's save
    // button: a slow source costs this derivation, not the save — the row is
    // stored pending and the background repair converges it (AC-27).
    await ensureRates(input.spentAt, deps, FOREGROUND_RATE_BUDGET_MS);
    const derived = await deriveOverrideForFixation({
      amountMinor: input.amountMinor,
      currency: input.currency,
      chargedAmountMinor: input.chargedAmountMinor,
      chargedCurrency: input.chargedCurrency,
      spentAt: input.spentAt,
    });
    if (derived) {
      rateToUsdOverride = derived.rateToUsdOverride;
      rateSource = derived.rateSource;
    }
  } else if (input.currency === "BTC" && isCurrentDate(input.spentAt)) {
    // "Today" (or the client's today, one day ahead of the server's — see
    // provider.ts): a back-dated BTC expense must not freeze today's live
    // price. It falls through with a null override and gets valued by the
    // daily snapshot instead (plan Step 5.2).
    const live = await fetchLiveBtcUsd(deps);
    if (live !== null) {
      rateToUsdOverride = live;
      rateSource = "coinbase";
    }
  }

  const [row] = await db
    .insert(expenses)
    .values({
      userId,
      categoryId: input.categoryId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      note: input.note,
      spentAt: input.spentAt,
      chargedAmountMinor: input.chargedAmountMinor ?? null,
      chargedCurrency: input.chargedCurrency ?? null,
      rateToUsdOverride,
      rateSource,
    })
    .returning();
  return row;
}

export async function updateExpense(
  userId: string,
  id: string,
  patch: ExpensePatch,
  deps: FxDeps = defaultDeps,
): Promise<Expense | null> {
  if (Object.keys(patch).length === 0) {
    return getExpense(userId, id);
  }

  const row = await getExpense(userId, id);
  if (!row) return null;

  // If reassigning the category, verify the new one belongs to the user.
  if (patch.categoryId && !(await userOwnsCategory(userId, patch.categoryId))) {
    return null;
  }

  // The editor always posts the full object, so "changed" is value
  // comparison against the stored row, not field presence in the patch
  // (plan Step 5.3).
  const effectiveCurrency =
    patch.currency !== undefined ? patch.currency : row.currency;
  const effectiveSpentAt =
    patch.spentAt !== undefined ? patch.spentAt : row.spentAt;
  const effectiveAmountMinor =
    patch.amountMinor !== undefined ? patch.amountMinor : row.amountMinor;
  const effectiveChargedAmountMinor =
    patch.chargedAmountMinor !== undefined
      ? patch.chargedAmountMinor
      : row.chargedAmountMinor;
  const effectiveChargedCurrency =
    patch.chargedCurrency !== undefined
      ? patch.chargedCurrency
      : row.chargedCurrency;

  if (!spentAtIsValid(effectiveSpentAt)) return null;
  if (
    !chargedPairIsValid(
      effectiveCurrency,
      effectiveChargedAmountMinor,
      effectiveChargedCurrency,
    )
  ) {
    return null;
  }

  const currencyChanged = effectiveCurrency !== row.currency;
  const spentAtChanged = effectiveSpentAt !== row.spentAt;
  const amountChanged = effectiveAmountMinor !== row.amountMinor;
  const chargedChanged =
    effectiveChargedAmountMinor !== row.chargedAmountMinor ||
    effectiveChargedCurrency !== row.chargedCurrency;

  const values: ExpensePatch & {
    rateToUsdOverride?: string | null;
    rateSource?: string | null;
  } = { ...patch };

  const chargedCleared =
    patch.chargedAmountMinor === null &&
    patch.chargedCurrency === null &&
    row.chargedAmountMinor !== null;

  if (chargedCleared && row.rateSource !== "coinbase") {
    // A 'user' rate can't outlive the fixation it's derived from
    // (expenses_rate_source_requires_charged) — clear both together, or the
    // paired CHECK constraints reject the update outright. Excluded for
    // 'coinbase': a live rate isn't derived from the charged pair, so
    // clearing the pair falls through to the coinbase branch below, which
    // leaves the rate alone unless the currency is also leaving BTC in the
    // same edit.
    values.rateToUsdOverride = null;
    values.rateSource = null;
  } else if (row.rateSource === "user") {
    // The amount is in the derivation's denominator, so an amount edit that
    // skipped re-derivation would leave a rate correct only in the charged
    // currency (plan Step 5.3, risk table).
    const inputsChanged =
      currencyChanged || spentAtChanged || amountChanged || chargedChanged;
    if (
      inputsChanged &&
      effectiveChargedAmountMinor !== null &&
      effectiveChargedCurrency !== null
    ) {
      // Mirrors createExpense: the derivation reads fx_rates, so it has to
      // wait for a snapshot to exist rather than reading a possibly empty
      // table (plan Step 5.2/5.3) — createExpense already did this, update
      // previously did not.
      await ensureRates(effectiveSpentAt, deps, FOREGROUND_RATE_BUDGET_MS);
      const derived = await deriveOverrideForFixation({
        amountMinor: effectiveAmountMinor,
        currency: effectiveCurrency,
        chargedAmountMinor: effectiveChargedAmountMinor,
        chargedCurrency: effectiveChargedCurrency,
        spentAt: effectiveSpentAt,
      });
      // A miss here (still no rate after ensureRates) nulls the override
      // rather than leaving the stale one in place: the charged pair itself
      // survives, so repairPendingOverrides converges the rate later
      // (AC-27) — keeping the old numeric would otherwise pair a stale rate
      // with a new charged amount/currency/date.
      values.rateToUsdOverride = derived?.rateToUsdOverride ?? null;
      values.rateSource = derived?.rateSource ?? null;
    }
  } else if (row.rateSource === "coinbase") {
    if (
      chargedChanged &&
      effectiveChargedAmountMinor !== null &&
      effectiveChargedCurrency !== null
    ) {
      // A newly supplied fixation is a fresh user assertion and overrides
      // the live Coinbase rate — otherwise the row would keep converting
      // through the stale live rate in every display currency but the
      // charged one (AC-6). Takes priority over the "left BTC" clear below
      // even if currency also changed in the same edit.
      await ensureRates(effectiveSpentAt, deps, FOREGROUND_RATE_BUDGET_MS);
      const derived = await deriveOverrideForFixation({
        amountMinor: effectiveAmountMinor,
        currency: effectiveCurrency,
        chargedAmountMinor: effectiveChargedAmountMinor,
        chargedCurrency: effectiveChargedCurrency,
        spentAt: effectiveSpentAt,
      });
      values.rateToUsdOverride = derived?.rateToUsdOverride ?? null;
      values.rateSource = derived?.rateSource ?? null;
    } else if (spentAtChanged || (currencyChanged && effectiveCurrency !== "BTC")) {
      // Never re-derived and never re-fetched live on update, only dropped:
      // once the row stops being BTC, and once its date moves. A live quote
      // asserts "this is what a bitcoin cost at the moment I bought" — moving
      // the date invalidates that assertion, and keeping the rate would freeze
      // the entry day's price onto another day, exactly what AC-7 refuses to
      // do for a back-dated create. Dropped, the row falls to the daily
      // snapshot of its new date, identical to that back-dated create.
      values.rateToUsdOverride = null;
      values.rateSource = null;
    }
  } else if (
    effectiveChargedAmountMinor !== null &&
    effectiveChargedCurrency !== null
  ) {
    // rate_source === null with a charged pair present: a fixation that
    // failed to derive (AC-27). Any edit retries from the row's current
    // state, converging to what the background repair would produce anyway.
    await ensureRates(effectiveSpentAt, deps, FOREGROUND_RATE_BUDGET_MS);
    const derived = await deriveOverrideForFixation({
      amountMinor: effectiveAmountMinor,
      currency: effectiveCurrency,
      chargedAmountMinor: effectiveChargedAmountMinor,
      chargedCurrency: effectiveChargedCurrency,
      spentAt: effectiveSpentAt,
    });
    if (derived) {
      values.rateToUsdOverride = derived.rateToUsdOverride;
      values.rateSource = derived.rateSource;
    }
  }

  const [updated] = await db
    .update(expenses)
    .set(values)
    .where(and(eq(expenses.id, id), eq(expenses.userId, userId)))
    .returning();
  return updated ?? null;
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
//
// `unconverted` counts the rows no rate could value. They are missing from the
// total, so it is short by real money — the UI marks a total carrying one
// rather than presenting it as exact (a category whose rows are all
// unconverted would otherwise read as a plain, believable «₽ 0»).
export interface SummaryRow extends ConvertedTotal {
  categoryId: string;
  name: string;
  color: string;
}

export interface Summary extends ConvertedTotal {
  byCategory: SummaryRow[];
}

export async function summary(
  userId: string,
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
      rateToUsdOverride: expenses.rateToUsdOverride,
      chargedAmountMinor: expenses.chargedAmountMinor,
      chargedCurrency: expenses.chargedCurrency,
    })
    .from(expenses)
    .innerJoin(categories, eq(expenses.categoryId, categories.id))
    .where(
      and(
        eq(expenses.userId, userId),
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
