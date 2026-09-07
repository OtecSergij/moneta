import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
} from "drizzle-orm";
import { db } from "@/db";
import { expenses, fxRates } from "@/db/schema";
import { type CurrencyCode } from "@/lib/currency";
import {
  type RateIndex,
  type RatePoint,
  deriveOverrideScaled,
  formatScaledRate,
  parseRate,
} from "@/lib/fx/convert";
import {
  type FxDeps,
  OFFICIAL_HISTORY_FLOOR,
  fetchRates,
  fetchableCurrencies,
  isScaledRateInBand,
} from "@/lib/fx/provider";

const BACKFILL_CONCURRENCY = 4;
const BACKFILL_MAX_DATES = 400;
const NEGATIVE_CACHE_MS = 60_000;

// Rows whose fixation still has no derivable rate, per repair pass. A row that
// can never derive — an implied rate permanently outside the sane band — stays
// in this query's result set forever, so the pass has to be bounded rather than
// "however many are pending". Anything above the cap waits for the next one.
const REPAIR_MAX_ROWS = 200;

/**
 * How long a page-render-triggered sync stays quiet for a user. The write
 * paths pass no throttle at all (they know something changed); this only
 * bounds the "opening the app is the retry" path, which would otherwise
 * re-scan the user's whole expense history on every single render.
 */
export const PAGE_SYNC_THROTTLE_MS = 5 * 60_000;

/**
 * Ceiling on how long a *foreground* caller waits for ensureRates. The fetch
 * itself is not cancelled — it stays in `inFlight` and still fills the table —
 * so exceeding the budget costs a derivation this request, not the rate: the
 * row is saved pending and `repairPendingOverrides` converges it (AC-27).
 * Without this a back-dated fixation blocks the save on the ECB full-history
 * download, whose own budget is 10 s.
 */
export const FOREGROUND_RATE_BUDGET_MS = 2_000;

// A thunk, not a captured reference: `{ fetch: globalThis.fetch }` binds once
// at module import time, so a test stubbing the global afterwards would have
// no effect on calls that fall back to this default (same reasoning as
// src/repositories/expenses.ts).
const defaultDeps: FxDeps = { fetch: (...args) => globalThis.fetch(...args) };

// In-flight requests keyed by date, so a debounced preview firing alongside
// the save it precedes shares one fetch instead of racing duplicates.
const inFlight = new Map<string, Promise<boolean>>();
// Dates that just failed, so retries inside the window don't hammer the
// provider again (plan Step 4.5, "Лавина запросов при недоступном API").
const negativeUntil = new Map<string, number>();

/**
 * Lazily fills `fx_rates` for `date` if it isn't already fully covered.
 * Never throws — a provider outage must not break expense creation, only
 * leave the rate unavailable (plan Step 4.6). Returns whether every currency
 * a source can supply for that date (`fetchableCurrencies`) ended up present
 * *for that exact date*: a snapshot the aggregator dated differently is
 * written under its own date and reported as a miss.
 */
export async function ensureRates(
  date: string,
  deps: FxDeps = defaultDeps,
  budgetMs?: number,
): Promise<boolean> {
  const cached = inFlight.get(date);
  if (cached) return withBudget(cached, budgetMs, date);

  const blockedUntil = negativeUntil.get(date);
  if (blockedUntil !== undefined) {
    if (Date.now() < blockedUntil) return false;
    // Expired: drop it rather than leave the key resident forever. The map is
    // keyed by date and quoteConversionAction accepts ~8 600 of them.
    negativeUntil.delete(date);
  }

  const promise = ensureRatesUncached(date, deps).finally(() => {
    inFlight.delete(date);
  });
  inFlight.set(date, promise);
  return withBudget(promise, budgetMs, date);
}

// Reports `false` if the fill outruns the budget, while leaving it running —
// see FOREGROUND_RATE_BUDGET_MS. A late `resolve` is a no-op, so the two
// racers need no interlock; only the timer has to be cleared, or a fast fill
// would still hold the event loop for the whole delay.
function withBudget(
  promise: Promise<boolean>,
  budgetMs: number | undefined,
  date: string,
): Promise<boolean> {
  if (budgetMs === undefined) return promise;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      console.info("fx.ensure_rates_slow", { date, budgetMs });
      resolve(false);
    }, budgetMs);
    const settle = (covered: boolean) => {
      clearTimeout(timer);
      resolve(covered);
    };
    promise.then(settle, () => settle(false));
  });
}

async function ensureRatesUncached(
  date: string,
  deps: FxDeps,
): Promise<boolean> {
  try {
    const have = new Set(
      (
        await db
          .select({ currency: fxRates.currency })
          .from(fxRates)
          .where(eq(fxRates.effectiveDate, date))
      ).map((r) => r.currency),
    );
    const expected = fetchableCurrencies(date);
    if (expected.every((c) => have.has(c))) return true;

    const fetched = await fetchRates(date, deps);
    if (fetched.length === 0) {
      negativeUntil.set(date, Date.now() + NEGATIVE_CACHE_MS);
      return false;
    }
    await db.insert(fxRates).values(fetched).onConflictDoNothing();

    // A row the aggregator dated to an earlier day (see AggregatorSnapshot in
    // provider.ts) leaves the requested date genuinely uncovered, so it must
    // be reported as a miss: readers then fall back to the nearest earlier
    // snapshot (the rows just written) within the currency's window, and the
    // dated snapshot for the requested date is still fetched later — by the
    // next write on that date or by the backfill.
    const covered = expected.every(
      (c) =>
        have.has(c) ||
        fetched.some((r) => r.currency === c && r.effectiveDate === date),
    );
    if (!covered) negativeUntil.set(date, Date.now() + NEGATIVE_CACHE_MS);
    return covered;
  } catch (err) {
    console.warn("fx.fetch_failed", { date, err });
    negativeUntil.set(date, Date.now() + NEGATIVE_CACHE_MS);
    return false;
  }
}

/**
 * Loads every currency's rate history up to and including `upTo` as a single
 * query — pure DB read, no network. `rateFor` (convert.ts) does the per-row
 * nearest-date lookup against the returned index.
 *
 * Deliberately unbounded below, hence the single bound in the signature:
 * rateFor may reach back to any earlier rate, and bounding the load by the
 * query range would let a row silently fail to convert while a usable rate
 * sat just outside the window.
 *
 * That makes it the most expensive read in a render, so callers that need it
 * more than once per request load it once and pass it down (see
 * src/app/history/page.tsx).
 */
export async function loadRateIndex(
  currencies: CurrencyCode[],
  upTo: string,
): Promise<RateIndex> {
  const index: RateIndex = new Map(currencies.map((c) => [c, [] as RatePoint[]]));
  if (currencies.length === 0) return index;

  const rows = await db
    .select({
      currency: fxRates.currency,
      effectiveDate: fxRates.effectiveDate,
      rateToUsd: fxRates.rateToUsd,
    })
    .from(fxRates)
    .where(
      and(
        inArray(fxRates.currency, currencies),
        lte(fxRates.effectiveDate, upTo),
      ),
    )
    .orderBy(asc(fxRates.effectiveDate));

  for (const row of rows) {
    index.get(row.currency)?.push({
      effectiveDate: row.effectiveDate,
      rateToUsd: parseRate(row.rateToUsd),
    });
  }

  return index;
}

const exactKey = (currency: CurrencyCode, date: string) =>
  `${currency}|${date}`;

/**
 * Rates for exactly these (currency, date) pairs — nothing carried forward.
 * A derived override is frozen onto its row and only recomputed when one of
 * its own inputs changes, so deriving it from a neighbouring day's snapshot
 * would silently bake in a rate the user never transacted at, with nothing
 * left to correct it. A miss keeps the row pending instead, which
 * repairPendingOverrides does converge.
 *
 * Two exact keys are all a derivation needs, so this replaces scanning a
 * currency's whole history through loadRateIndex to reach one row.
 */
async function loadExactRates(
  currencies: CurrencyCode[],
  dates: string[],
): Promise<Map<string, bigint>> {
  const exact = new Map<string, bigint>();
  if (currencies.length === 0 || dates.length === 0) return exact;

  const rows = await db
    .select({
      currency: fxRates.currency,
      effectiveDate: fxRates.effectiveDate,
      rateToUsd: fxRates.rateToUsd,
    })
    .from(fxRates)
    .where(
      and(
        inArray(fxRates.currency, currencies),
        inArray(fxRates.effectiveDate, dates),
      ),
    );

  for (const row of rows) {
    exact.set(
      exactKey(row.currency, row.effectiveDate),
      parseRate(row.rateToUsd),
    );
  }
  return exact;
}

export interface FixationInputs {
  amountMinor: number;
  currency: CurrencyCode;
  chargedAmountMinor: number;
  chargedCurrency: CurrencyCode;
  spentAt: string;
}

export interface DerivedOverride {
  rateToUsdOverride: string;
  rateSource: "user";
}

// deriveOverrideScaled has no bound of its own — an extreme but individually
// valid charged pair (a huge charge against a tiny entered amount) can imply a
// rate numeric(36,20) can store but that is nonsense as a currency rate, and
// past ~1e16 USD per unit it does not even fit the column. Same band the
// provider enforces on fetched rates (src/lib/fx/provider.ts).
function deriveOverrideInBand(
  params: Omit<FixationInputs, "spentAt"> & { rateChargedToUsd: bigint },
): DerivedOverride | null {
  const scaled = deriveOverrideScaled(params);
  if (!isScaledRateInBand(scaled)) return null;
  return { rateToUsdOverride: formatScaledRate(scaled), rateSource: "user" };
}

/**
 * Rate implied by a manual fixation, read from whatever `fx_rates` snapshot
 * already exists — pure lookup, no network. The one derivation entry point for
 * the write paths (createExpense/updateExpense in
 * src/repositories/expenses.ts) and the preview (src/lib/actions/fx.ts); the
 * background repair below shares the same two helpers rather than this
 * function only because it reads its rates in bulk. A row repaired later has
 * to be indistinguishable from one that got its rate immediately, so all of
 * them must apply the exact-date rule and the band check identically.
 *
 * Returns null when the snapshot isn't there yet or the implied rate is out of
 * band; the row is then left with rate_source = null for the repair to pick up
 * (AC-27).
 */
export async function deriveOverrideForFixation(
  params: FixationInputs,
): Promise<DerivedOverride | null> {
  const exact = await loadExactRates(
    [params.chargedCurrency],
    [params.spentAt],
  );
  const rate = exact.get(exactKey(params.chargedCurrency, params.spentAt));
  if (rate === undefined) return null;
  return deriveOverrideInBand({ ...params, rateChargedToUsd: rate });
}

// Dates (from `dates`) that already have every currency a source can supply
// for them in `fx_rates` — counted in JS rather than a raw `sql<number>`
// count(*), since a handful of rows per date is cheap and this sidesteps
// drizzle's raw-fragment/bigint string trap entirely (see convert.ts module
// doc and plan ADR).
async function datesFullyCovered(dates: string[]): Promise<Set<string>> {
  if (dates.length === 0) return new Set();
  const rows = await db
    .select({ effectiveDate: fxRates.effectiveDate })
    .from(fxRates)
    .where(inArray(fxRates.effectiveDate, dates));

  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.effectiveDate, (counts.get(row.effectiveDate) ?? 0) + 1);
  }
  const covered = new Set<string>();
  for (const [date, count] of counts) {
    if (count >= fetchableCurrencies(date).length) covered.add(date);
  }
  return covered;
}

/**
 * Fills `fx_rates` for every distinct date the user has spent on, at or
 * after `OFFICIAL_HISTORY_FLOOR`, that isn't already fully covered. Runs up
 * to `BACKFILL_CONCURRENCY` dates at once, caps a single call at
 * `BACKFILL_MAX_DATES` (the remainder is picked up by the next call), and
 * swallows per-date errors so one bad date doesn't stop the rest. Returns
 * the number of dates that ended up fully filled.
 */
export async function backfillRates(
  userId: string,
  deps: FxDeps = defaultDeps,
): Promise<number> {
  try {
    const expenseDates = await db
      .selectDistinct({ spentAt: expenses.spentAt })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          gte(expenses.spentAt, OFFICIAL_HISTORY_FLOOR),
        ),
      );

    const distinctDates = expenseDates.map((r) => r.spentAt);
    if (distinctDates.length === 0) return 0;

    const covered = await datesFullyCovered(distinctDates);
    const pending = distinctDates
      .filter((d) => !covered.has(d))
      .slice(0, BACKFILL_MAX_DATES);

    let filled = 0;
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < pending.length) {
        const date = pending[cursor++];
        try {
          if (await ensureRates(date, deps)) filled++;
        } catch {
          // A single date's failure must not stop the rest of the backfill.
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(BACKFILL_CONCURRENCY, pending.length) }, worker),
    );

    console.info("fx.backfill_done", { userId, filled });
    return filled;
  } catch (err) {
    console.warn("fx.fetch_failed", { userId, err });
    return 0;
  }
}

/**
 * Second phase of the background fill: rows whose manual fixation
 * (`charged*`) was saved while `rate_to_usd_override` could not be derived
 * (the rate table was empty at the time) get it derived now, if the charged
 * currency's rate for that exact day has since appeared. Without this,
 * `backfillRates` alone
 * only closes the gap for dates, not for fixations that failed mid-write
 * (plan Step 4.5.3, AC-27). Returns the number of rows repaired.
 */
export async function repairPendingOverrides(userId: string): Promise<number> {
  try {
    const pending = await db
      .select({
        id: expenses.id,
        amountMinor: expenses.amountMinor,
        currency: expenses.currency,
        spentAt: expenses.spentAt,
        chargedAmountMinor: expenses.chargedAmountMinor,
        chargedCurrency: expenses.chargedCurrency,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.userId, userId),
          isNotNull(expenses.chargedAmountMinor),
          isNull(expenses.rateToUsdOverride),
          // Same floor backfillRates fills to: below it no source will ever
          // publish a rate, so those rows are not "pending", they are
          // permanently underivable and only cost work to revisit.
          gte(expenses.spentAt, OFFICIAL_HISTORY_FLOOR),
        ),
      )
      .limit(REPAIR_MAX_ROWS);
    if (pending.length === 0) return 0;

    const chargedCurrencies = Array.from(
      new Set(
        pending
          .map((r) => r.chargedCurrency)
          .filter((c): c is CurrencyCode => c !== null),
      ),
    );
    const exact = await loadExactRates(
      chargedCurrencies,
      Array.from(new Set(pending.map((r) => r.spentAt))),
    );

    let repaired = 0;
    for (const row of pending) {
      // Per row, so one unwritable rate can't abort the pass — and with it
      // every later row — on every single run.
      try {
        if (row.chargedCurrency === null || row.chargedAmountMinor === null) {
          continue;
        }
        const rate = exact.get(exactKey(row.chargedCurrency, row.spentAt));
        if (rate === undefined) continue;

        const derived = deriveOverrideInBand({
          amountMinor: row.amountMinor,
          currency: row.currency,
          chargedAmountMinor: row.chargedAmountMinor,
          chargedCurrency: row.chargedCurrency,
          rateChargedToUsd: rate,
        });
        if (!derived) continue;

        await db
          .update(expenses)
          .set(derived)
          .where(and(eq(expenses.id, row.id), eq(expenses.userId, userId)));
        repaired++;
      } catch (err) {
        console.warn("fx.repair_failed", { id: row.id, err });
      }
    }

    return repaired;
  } catch (err) {
    console.warn("fx.fetch_failed", { userId, err });
    return 0;
  }
}

const lastSyncAt = new Map<string, number>();

/**
 * The background fill, as one call: fill the snapshots the user's dates need,
 * then derive the fixations that were saved before their rate existed.
 *
 * Sequential, not concurrent: repairPendingOverrides reads the very rows
 * backfillRates is still writing, so running them side by side would make
 * AC-27's second phase need two passes to converge instead of one.
 *
 * `throttleMs` is for callers that fire on plain navigation — the page
 * renders that make "opening the app" the retry for a provider outage. Write
 * paths pass nothing: they know state changed and must converge immediately.
 */
export async function syncUserRates(
  userId: string,
  { throttleMs }: { throttleMs?: number } = {},
): Promise<void> {
  const last = lastSyncAt.get(userId);
  if (
    throttleMs !== undefined &&
    last !== undefined &&
    Date.now() - last < throttleMs
  ) {
    return;
  }
  // Recorded on every pass, throttled or not, so the page render that follows
  // a save is covered by the save's own converged sync.
  lastSyncAt.set(userId, Date.now());

  await backfillRates(userId);
  await repairPendingOverrides(userId);
}
