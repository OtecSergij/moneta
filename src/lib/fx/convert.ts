// Pure integer FX conversion — the one arithmetic module money math goes
// through in this app (see .omc/plans/multi-currency-expenses.md, "Шаг 3").
// No DB, no network: callers hand in a pre-loaded RateIndex and get back
// micro-minor bigints (1e-6 of a minor unit) that they round exactly once,
// so a period total never drifts from independently-rounded per-row or
// per-group amounts by more than the AC-29 tolerance.
//
// Invariants:
//   - Rates are bigints scaled by 1e20. `Number` is never applied to a rate
//     — a double only carries ~15-17 significant digits, short of the 20
//     fractional digits `fx_rates.rate_to_usd` stores.
//   - A missing rate returns `null`, never a substituted rate of 1.

import { type CurrencyCode, currencyMeta } from "@/lib/currency";
import { divRoundHalfEven } from "@/lib/half-even";

/** One day's rate to USD for a currency, scaled by 1e20. */
export interface RatePoint {
  effectiveDate: string; // "YYYY-MM-DD"
  rateToUsd: bigint; // scale 1e20
}

/** Per-currency rate history. Each array is sorted ascending by effectiveDate. */
export type RateIndex = Map<CurrencyCode, RatePoint[]>;

export interface ConvertibleRow {
  amountMinor: number;
  currency: CurrencyCode;
  spentAt: string; // "YYYY-MM-DD"
  rateToUsdOverride: string | null; // numeric from DB, as a string
  chargedAmountMinor: number | null;
  chargedCurrency: CurrencyCode | null;
}

const RATE_SCALE_DIGITS = 20;
const MICRO_DIGITS = 6;
// `123n` literal syntax needs an ES2020 target; this project's tsconfig
// targets ES2017, so every bigint here goes through the `BigInt()` call form.
const TEN = BigInt(10);
const MICRO_PER_MINOR = TEN ** BigInt(MICRO_DIGITS);

/**
 * Scale a Postgres `numeric` rate string (e.g. "0.00000012877219489060") to
 * a bigint at 1e20 by exact string shifting — never via `Number`, which
 * would silently round the tail digits away.
 */
export function parseRate(numericFromDb: string): bigint {
  const trimmed = numericFromDb.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart = ""] = unsigned.split(".");
  const paddedFrac = (fracPart + "0".repeat(RATE_SCALE_DIGITS)).slice(0, RATE_SCALE_DIGITS);
  const value = BigInt(`${intPart || "0"}${paddedFrac}`);
  return negative ? -value : value;
}

// Rightmost index whose effectiveDate <= onDate, or -1 if none qualifies.
// `points` is sorted ascending, so this is a plain upper-bound binary search.
function findLatestOnOrBefore(points: RatePoint[], onDate: string): number {
  let lo = 0;
  let hi = points.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].effectiveDate <= onDate) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}

/**
 * Nearest rate to USD for `currency` on or before `onDate`. Deliberately
 * unbounded in age: an official fixing stays in force until the next one is
 * published, so a rate from an earlier date is the rate in force, not a
 * stale approximation. Refusing an old-but-usable rate used to drop the row
 * out of every total, which is a 100% error in place of a fractional one.
 * `null` only when we hold no rate for this currency at all.
 */
export function rateFor(index: RateIndex, currency: CurrencyCode, onDate: string): bigint | null {
  const points = index.get(currency);
  if (!points || points.length === 0) return null;
  const i = findLatestOnOrBefore(points, onDate);
  return i === -1 ? null : points[i].rateToUsd;
}

/**
 * Micro-minor units of `row` valued in `display` currency, or `null` when no
 * rate gets us there. Branch order is load-bearing (plan "Шаг 3.3"):
 *   1. charged pair matches display -> the actual charge, exactly.
 *   2. row's own currency matches display -> the entered amount, exactly,
 *      unconditionally — even with an override present. A BTC row with a
 *      live Coinbase rate must not get re-valued through the daily snapshot
 *      when shown in BTC.
 *   3. otherwise convert through rates: the row's override if it has one,
 *      else the day's snapshot — looked up independently for `from` and
 *      `to`, since only the "from" side can carry an override.
 *   4. any missing rate -> null, never a substituted rate of 1.
 */
export function convertMicro(row: ConvertibleRow, display: CurrencyCode, index: RateIndex): bigint | null {
  if (row.chargedCurrency === display && row.chargedAmountMinor !== null) {
    return BigInt(row.chargedAmountMinor) * MICRO_PER_MINOR;
  }
  if (row.currency === display) {
    return BigInt(row.amountMinor) * MICRO_PER_MINOR;
  }

  const rateFrom =
    row.rateToUsdOverride !== null ? parseRate(row.rateToUsdOverride) : rateFor(index, row.currency, row.spentAt);
  const rateTo = rateFor(index, display, row.spentAt);
  if (rateFrom === null || rateTo === null) return null;

  const expFrom = currencyMeta(row.currency).exponent;
  const expTo = currencyMeta(display).exponent;
  return (
    (BigInt(row.amountMinor) * rateFrom * TEN ** BigInt(expTo + MICRO_DIGITS)) / (rateTo * TEN ** BigInt(expFrom))
  );
}

/**
 * Round micro-minor units straight down to `currency`'s displayed precision
 * in one half-even step, returned as minor units (an exact multiple of
 * `10^(exponent - displayDigits)`). Rounding through an intermediate minor-
 * unit step would let per-group error exceed half a display unit and break
 * the AC-29 tolerance.
 */
export function roundToDisplay(micro: bigint, currency: CurrencyCode): number {
  const meta = currencyMeta(currency);
  const granularity = TEN ** BigInt(meta.exponent - meta.displayDigits + MICRO_DIGITS);
  const steps = divRoundHalfEven(micro, granularity);
  return Number(steps * TEN ** BigInt(meta.exponent - meta.displayDigits));
}

export function convertRow(row: ConvertibleRow, display: CurrencyCode, index: RateIndex): number | null {
  const micro = convertMicro(row, display, index);
  return micro === null ? null : roundToDisplay(micro, display);
}

export interface ConvertedTotal {
  totalMinor: number;
  /**
   * Rows no rate could value. They contribute nothing to `totalMinor`, so a
   * non-zero count means the total is short by real money — the reason this
   * is part of the return value rather than a detail callers may ignore.
   */
  unconverted: number;
}

/**
 * Period total across `rows`: sums micro-minor units first and rounds once
 * at the end (AC-12), instead of summing already-rounded per-row amounts —
 * the two do not generally agree.
 */
export function sumConverted(
  rows: ConvertibleRow[],
  display: CurrencyCode,
  index: RateIndex,
): ConvertedTotal {
  let totalMicro = BigInt(0);
  let unconverted = 0;
  for (const row of rows) {
    const micro = convertMicro(row, display, index);
    if (micro === null) {
      unconverted++;
      continue;
    }
    totalMicro += micro;
  }
  return { totalMinor: roundToDisplay(totalMicro, display), unconverted };
}

export interface DayBucket<T extends ConvertibleRow> extends ConvertedTotal {
  day: string; // "YYYY-MM-DD"
  items: T[];
}

/**
 * Buckets `rows` into consecutive runs sharing the same `spentAt` and totals
 * each run through `sumConverted` — the history page's "по дням" axis, which
 * the plan singles out as the long one (up to ~90 groups in a quarter, see
 * AC-29). Rows must already be ordered so same-day rows are adjacent (the
 * repository's `ORDER BY spent_at DESC`); this does not sort them itself.
 */
export function sumConvertedByDay<T extends ConvertibleRow>(
  rows: T[],
  display: CurrencyCode,
  index: RateIndex,
): DayBucket<T>[] {
  const buckets: DayBucket<T>[] = [];
  for (const row of rows) {
    const last = buckets[buckets.length - 1];
    if (last && last.day === row.spentAt) {
      last.items.push(row);
    } else {
      buckets.push({
        day: row.spentAt,
        totalMinor: 0,
        unconverted: 0,
        items: [row],
      });
    }
  }
  for (const bucket of buckets) {
    const { totalMinor, unconverted } = sumConverted(
      bucket.items,
      display,
      index,
    );
    bucket.totalMinor = totalMinor;
    bucket.unconverted = unconverted;
  }
  return buckets;
}

/**
 * Rate implied by a manual fixation: the user says "I paid `amountMinor`
 * `currency` and my bank charged me `chargedAmountMinor` `chargedCurrency`".
 *
 *   override = (charged / 10^expCharged) * rate_to_usd(chargedCurrency)
 *              / (amount / 10^expCurrency)
 *
 * Lives here rather than in the repository because the insert path and the
 * background repair path must produce bit-identical rates: a row repaired
 * later has to be indistinguishable from one that got its rate immediately.
 */
export function deriveOverrideScaled(row: {
  amountMinor: number;
  currency: CurrencyCode;
  chargedAmountMinor: number;
  chargedCurrency: CurrencyCode;
  rateChargedToUsd: bigint;
}): bigint {
  const expCurrency = currencyMeta(row.currency).exponent;
  const expCharged = currencyMeta(row.chargedCurrency).exponent;
  const numerator =
    BigInt(row.chargedAmountMinor) * row.rateChargedToUsd * TEN ** BigInt(expCurrency);
  const denominator = TEN ** BigInt(expCharged) * BigInt(row.amountMinor);
  return divRoundHalfEven(numerator, denominator);
}

// Inverse of parseRate: renders a scale-1e20 bigint back to the
// numeric(36,20) decimal string the column expects.
export function formatScaledRate(value: bigint): string {
  const digits = value.toString().padStart(21, "0");
  const intPart = digits.slice(0, -20) || "0";
  const fracPart = digits.slice(-20);
  return `${intPart}.${fracPart}`;
}
