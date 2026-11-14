import { and, asc, between, desc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { expenses, fxRates, topUps, transfers } from "@/db/schema";
import { type CurrencyCode } from "@/lib/currency";
import { MAX_ENTRY_AGE_DAYS } from "@/lib/dates";
import { type RateIndex, type RatePoint, parseRate } from "@/lib/fx/convert";
import {
  type FxDeps,
  fetchRates,
  fetchableCurrencies,
  utcISODate,
} from "@/lib/fx/provider";

const GAP_PASS_CONCURRENCY = 4;

// A thunk, not a captured reference: `{ fetch: globalThis.fetch }` binds once
// at module import time, so a test stubbing the global afterwards would have
// no effect on calls that fall back to this default. Deferring the lookup
// into the wrapper reads globalThis.fetch fresh on every call.
const defaultDeps: FxDeps = { fetch: (...args) => globalThis.fetch(...args) };

/**
 * Fills `fx_rates` for `date` if it isn't already fully covered. Never
 * throws; a date that ends up short is logged on one line with the reason.
 * Returns whether every currency a source can supply for that date
 * (`fetchableCurrencies`) ended up present *for that exact date*: a snapshot
 * the aggregator dated differently is written under its own date and
 * reported as a miss.
 */
async function ensureRates(date: string, deps: FxDeps, now: Date): Promise<boolean> {
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

    const fetched = await fetchRates(date, deps, now);
    if (fetched.length > 0) {
      await db.insert(fxRates).values(fetched).onConflictDoNothing();
    }

    const missing = expected.filter(
      (c) =>
        !have.has(c) &&
        !fetched.some((r) => r.currency === c && r.effectiveDate === date),
    );
    // An ECB file without the date is today on a weekend or a holiday: no
    // rate exists yet, which is not a failure.
    const ecbAnswered = fetched.some((r) => r.source === "ecb");
    const failed = missing.filter((c) => c !== "EUR" || !ecbAnswered);
    if (failed.length > 0) {
      console.warn("fx.load_failed", date, `no rate for ${failed.join(", ")}`);
    }
    return missing.length === 0;
  } catch (err) {
    console.warn("fx.load_failed", date, String(err));
    return false;
  }
}

/** The daily run: today's rates, "today" being the server's UTC date. */
export function loadTodayRates(
  now: Date = new Date(),
  deps: FxDeps = defaultDeps,
): Promise<boolean> {
  return ensureRates(utcISODate(now), deps, now);
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
  if (currencies.length === 0) return new Map();

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
  return toRateIndex(currencies, rows);
}

/**
 * Only the rate in force on `onDate` for each currency — the point rateFor
 * would pick from loadRateIndex(currencies, onDate) — for a render that
 * converts on that one date alone. Useless for rows dated earlier.
 */
export async function loadRatesOn(
  currencies: CurrencyCode[],
  onDate: string,
): Promise<RateIndex> {
  if (currencies.length === 0) return new Map();

  const rows = await db
    .selectDistinctOn([fxRates.currency], {
      currency: fxRates.currency,
      effectiveDate: fxRates.effectiveDate,
      rateToUsd: fxRates.rateToUsd,
    })
    .from(fxRates)
    .where(
      and(
        inArray(fxRates.currency, currencies),
        lte(fxRates.effectiveDate, onDate),
      ),
    )
    .orderBy(fxRates.currency, desc(fxRates.effectiveDate));
  return toRateIndex(currencies, rows);
}

function toRateIndex(
  currencies: CurrencyCode[],
  rows: { currency: CurrencyCode; effectiveDate: string; rateToUsd: string }[],
): RateIndex {
  const index: RateIndex = new Map(currencies.map((c) => [c, [] as RatePoint[]]));
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
// doc).
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

type DatedTable = typeof expenses | typeof topUps | typeof transfers;
type DayColumn =
  | typeof expenses.spentAt
  | typeof topUps.occurredOn
  | typeof transfers.enteredOn;

function daysOf(table: DatedTable, day: DayColumn, from: string, to: string) {
  return db.select({ date: day }).from(table).where(between(day, from, to));
}

/**
 * The gap pass: fills `fx_rates` for every distinct expense, top-up or
 * transfer date of any space from MAX_ENTRY_AGE_DAYS + 2 days ago up to
 * yesterday (server UTC) that isn't already fully covered, up to
 * `GAP_PASS_CONCURRENCY` dates at once. The two extra days cover a form's
 * oldest date until the next pass: one day for the wait, one for a client
 * west of UTC. Returns the number of dates that ended up fully filled.
 */
export async function fillRateGaps(
  now: Date = new Date(),
  deps: FxDeps = defaultDeps,
): Promise<number> {
  const from = utcISODate(now, MAX_ENTRY_AGE_DAYS + 2);
  const to = utcISODate(now, 1);
  const entryDates = await daysOf(expenses, expenses.spentAt, from, to)
    .union(daysOf(topUps, topUps.occurredOn, from, to))
    .union(daysOf(transfers, transfers.enteredOn, from, to));

  const distinctDates = entryDates.map((r) => r.date);
  const covered = await datesFullyCovered(distinctDates);
  const pending = distinctDates.filter((d) => !covered.has(d)).sort();

  let filled = 0;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < pending.length) {
      const date = pending[cursor++];
      if (await ensureRates(date, deps, now)) filled++;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(GAP_PASS_CONCURRENCY, pending.length) }, worker),
  );

  console.info("fx.gap_pass_done", `filled=${filled}`, `dates=${pending.join(",")}`);
  return filled;
}
