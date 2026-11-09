import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { expenses, fxRates } from "@/db/schema";
import { type CurrencyCode } from "@/lib/currency";
import { type RateIndex, type RatePoint, parseRate } from "@/lib/fx/convert";
import {
  type FxDeps,
  OFFICIAL_HISTORY_FLOOR,
  fetchRates,
  fetchableCurrencies,
} from "@/lib/fx/provider";

const BACKFILL_CONCURRENCY = 4;
const BACKFILL_MAX_DATES = 400;
const NEGATIVE_CACHE_MS = 60_000;

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
 * so exceeding the budget costs this one response, not the rate. Without it a
 * back-dated preview blocks on the ECB full-history download, whose own
 * budget is 10 s.
 */
export const FOREGROUND_RATE_BUDGET_MS = 2_000;

// A thunk, not a captured reference: `{ fetch: globalThis.fetch }` binds once
// at module import time, so a test stubbing the global afterwards would have
// no effect on calls that fall back to this default. Deferring the lookup
// into the wrapper reads globalThis.fetch fresh on every call.
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

const lastSyncAt = new Map<string, number>();

/**
 * The background fill: the snapshots the user's expense dates need.
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
}
