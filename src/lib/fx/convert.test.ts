import { describe, expect, it } from "vitest";
import { CURRENCY_CODES, type CurrencyCode, currencyMeta } from "@/lib/currency";
import {
  type ConvertibleRow,
  type RateIndex,
  convertMicro,
  convertRow,
  parseRate,
  rateFor,
  rateSnapshot,
  roundToDisplay,
  snapshotIndex,
  sumConverted,
  sumConvertedByDay,
} from "@/lib/fx/convert";

function buildIndex(entries: Partial<Record<CurrencyCode, Array<{ date: string; rate: string }>>>): RateIndex {
  const index: RateIndex = new Map();
  for (const currency of CURRENCY_CODES) {
    const points = entries[currency];
    if (!points) continue;
    index.set(
      currency,
      points.map((p) => ({ effectiveDate: p.date, rateToUsd: parseRate(p.rate) })),
    );
  }
  return index;
}

function row(overrides: Partial<ConvertibleRow> & Pick<ConvertibleRow, "amountMinor" | "currency">): ConvertibleRow {
  return {
    spentAt: "2026-09-01",
    ...overrides,
  };
}

// UTC epoch-millis add, matching convert.ts's own daysBetween — avoids any
// local-time drift across the 90-day span the day-axis fixture below spans.
function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

describe("parseRate", () => {
  it("scales a DB-shaped padded decimal to 1e20 by exact string shift", () => {
    expect(parseRate("0.00000012877219489060")).toBe(BigInt("12877219489060"));
  });

  it("keeps full precision on 20 fractional digits — Number would round this away", () => {
    expect(parseRate("78783.80494894651871698368")).toBe(BigInt("7878380494894651871698368"));
  });
});

describe("rateFor", () => {
  it("returns the rate exactly on its effective date", () => {
    const index = buildIndex({ RUB: [{ date: "2026-08-20", rate: "0.01158489241400153276" }] });
    expect(rateFor(index, "RUB", "2026-08-20")).toBe(parseRate("0.01158489241400153276"));
  });

  it("reaches back to an arbitrarily old rate rather than refusing", () => {
    // An official fixing stays in force until the next one, so age is not a
    // reason to refuse: a year-old rate still converts.
    const index = buildIndex({ RUB: [{ date: "2026-08-20", rate: "0.01158489241400153276" }] });
    for (const on of ["2026-08-27", "2026-08-28", "2027-08-20"]) {
      expect(rateFor(index, "RUB", on)).toBe(parseRate("0.01158489241400153276"));
    }
  });

  it("binary-searches to the nearest earlier point, not the first or last", () => {
    const index = buildIndex({
      RUB: [
        { date: "2026-08-01", rate: "0.01000000000000000000" },
        { date: "2026-08-10", rate: "0.01100000000000000000" },
        { date: "2026-08-20", rate: "0.01200000000000000000" },
      ],
    });
    expect(rateFor(index, "RUB", "2026-08-15")).toBe(parseRate("0.01100000000000000000"));
  });

  it("returns null for a currency absent from the index", () => {
    const index = buildIndex({ RUB: [{ date: "2026-08-20", rate: "0.01158489241400153276" }] });
    expect(rateFor(index, "EUR", "2026-08-20")).toBeNull();
  });
});

describe("convertMicro / convertRow — rate selection ladder", () => {
  it("identity: a RUB row displayed in RUB returns the entered amount", () => {
    const r = row({ amountMinor: 1248050, currency: "RUB" });
    expect(convertRow(r, "RUB", new Map())).toBe(1248050);
  });

  it("exponent shift: 3000 RSD is ~2560 RUB at the 1 Sept rates", () => {
    const index = buildIndex({
      RSD: [{ date: "2026-09-01", rate: "0.00988734312401027658" }],
      RUB: [{ date: "2026-09-01", rate: "0.01158489241400153276" }],
    });
    const r = row({ amountMinor: 300000, currency: "RSD" }); // 3000.00 RSD
    expect(convertMicro(r, "RUB", index)).toBe(BigInt("256040611444"));
    expect(convertRow(r, "RUB", index)).toBe(256041); // 2560.41 RUB
  });

  it("exponent shift: 4500 sats is ~306 RUB at the 1 Sept rates", () => {
    const index = buildIndex({
      BTC: [{ date: "2026-09-01", rate: "78783.80494894651871698368" }],
      RUB: [{ date: "2026-09-01", rate: "0.01158489241400153276" }],
    });
    const r = row({ amountMinor: 4500, currency: "BTC" });
    expect(convertMicro(r, "RUB", index)).toBe(BigInt("30602539031"));
    expect(convertRow(r, "RUB", index)).toBe(30603); // 306.03 RUB
  });

  it("never substitutes a rate of 1 — a missing 'from' or 'to' rate returns null", () => {
    // If a rate of 1 were substituted for the missing leg, this would resolve
    // to a nonzero RUB amount instead of null.
    const r = row({ amountMinor: 300000, currency: "RSD" });
    const noFrom = buildIndex({ RUB: [{ date: "2026-09-01", rate: "0.01158489241400153276" }] });
    expect(convertMicro(r, "RUB", noFrom)).toBeNull();
    expect(convertRow(r, "RUB", noFrom)).toBeNull();

    const noTo = buildIndex({ RSD: [{ date: "2026-09-01", rate: "0.00988734312401027658" }] });
    expect(convertRow(r, "RUB", noTo)).toBeNull();
  });

  it("converts through a month-old rate instead of dropping the row", () => {
    const index = buildIndex({
      RSD: [{ date: "2026-08-01", rate: "0.00988734312401027658" }], // 31 days before spentAt
      RUB: [{ date: "2026-09-01", rate: "0.01158489241400153276" }],
    });
    const r = row({ amountMinor: 300000, currency: "RSD" });
    // 3000 RSD * 0.00988734 = 29.662 USD / 0.01158489 = 2560.41 RUB
    expect(convertRow(r, "RUB", index)).toBe(256041);
  });
});

describe("roundToDisplay — half-even, single step", () => {
  it("rounds ties to the nearest even kopeck (RUB, exponent === displayDigits)", () => {
    expect(roundToDisplay(BigInt(1_500_000), "RUB")).toBe(2); // 1.5 -> 2 (even)
    expect(roundToDisplay(BigInt(2_500_000), "RUB")).toBe(2); // 2.5 -> 2 (even), not 3
  });

  it("rounds ties to the nearest even dinar in one step (RSD, displayDigits 0)", () => {
    expect(roundToDisplay(BigInt(150_000_000), "RSD")).toBe(200); // 1.5 dinars -> 2 (even)
    expect(roundToDisplay(BigInt(250_000_000), "RSD")).toBe(200); // 2.5 dinars -> 2 (even), not 300
  });

  it("rounds non-tie values to the nearest neighbor", () => {
    expect(roundToDisplay(BigInt(1_400_000), "RUB")).toBe(1);
    expect(roundToDisplay(BigInt(1_600_000), "RUB")).toBe(2);
  });
});

describe("sumConverted — the one remaining unconvertible case", () => {
  it("excludes a row of a currency we hold no rate for at all", () => {
    // Only reachable before the first rate for that currency has ever been
    // stored; the next fetch fixes it retroactively, since conversion is
    // computed at read time and nothing is baked into the row.
    const index = buildIndex({ RUB: [{ date: "2026-09-01", rate: "0.01158489241400153276" }] });
    const rows: ConvertibleRow[] = [
      row({ amountMinor: 100000, currency: "RUB" }), // identity, 1000.00 RUB
      row({ amountMinor: 300000, currency: "RSD" }), // no RSD rate at all
    ];
    expect(sumConverted(rows, "RUB", index)).toEqual({
      totalMinor: 100000,
      // The RSD row is missing from the total, and the count is how callers
      // learn the figure is short by real money rather than exact.
      unconverted: 1,
    });
  });
});

describe("negative amounts", () => {
  const index = buildIndex({
    RSD: [{ date: "2026-09-01", rate: "0.00988734312401027658" }],
    RUB: [{ date: "2026-09-01", rate: "0.01158489241400153276" }],
    BTC: [{ date: "2026-09-01", rate: "78783.80494894651871698368" }],
  });

  it("convertRow is symmetric around zero", () => {
    const cases: Array<[number, CurrencyCode, CurrencyCode]> = [
      [300000, "RSD", "RUB"],
      [4500, "BTC", "RUB"],
      [123457, "RUB", "RSD"],
      [150, "RSD", "RUB"],
    ];
    for (const [amountMinor, currency, display] of cases) {
      const positive = convertRow(row({ amountMinor, currency }), display, index)!;
      const negative = convertRow(row({ amountMinor: -amountMinor, currency }), display, index)!;
      expect(negative + positive).toBe(0);
    }
  });

  it("sumConverted nets rows of mixed sign", () => {
    const rows: ConvertibleRow[] = [
      row({ amountMinor: 300000, currency: "RSD" }),
      row({ amountMinor: -100000, currency: "RUB" }),
      row({ amountMinor: -4500, currency: "BTC" }),
    ];
    expect(sumConverted(rows, "RUB", index)).toEqual({
      totalMinor: 256041 - 100000 - 30603,
      unconverted: 0,
    });
    expect(sumConverted(rows.map((r) => ({ ...r, amountMinor: -r.amountMinor })), "RUB", index)).toEqual({
      totalMinor: -(256041 - 100000 - 30603),
      unconverted: 0,
    });
  });
});

describe("aggregation over many rows", () => {
  const bulkIndex = buildIndex({
    RUB: [{ date: "2026-09-01", rate: "0.01000000000000000000" }],
    USD: [{ date: "2026-09-01", rate: "1.00000000000000000000" }],
    EUR: [{ date: "2026-09-01", rate: "1.10000000000000000000" }],
    RSD: [{ date: "2026-09-01", rate: "0.00950000000000000000" }],
    BTC: [{ date: "2026-09-01", rate: "50000.00000000000000000000" }],
  });
  const rows: ConvertibleRow[] = Array.from({ length: 60 }, (_, i) =>
    row({ amountMinor: 100_000 + i * 777, currency: CURRENCY_CODES[i % 5] }),
  );

  it("a single rounding of the period total differs from summing per-row rounded amounts", () => {
    // RSD (displayDigits 0) makes per-row rounding error largest and the
    // divergence deterministic for this fixture.
    const { totalMinor: single } = sumConverted(rows, "RSD", bulkIndex);
    const perRow = rows.reduce((sum, r) => sum + (convertRow(r, "RSD", bulkIndex) ?? 0), 0);
    expect(single).not.toBe(perRow);
  });

  it("stays within the reconciliation tolerance against group totals, on two grouping axes, in five display currencies", () => {
    for (const display of CURRENCY_CODES) {
      const { totalMinor: periodTotal } = sumConverted(rows, display, bulkIndex);

      // groupSize 5 -> 12 groups (category-like axis), groupSize 2 -> 30 groups (day-like axis).
      for (const groupSize of [5, 2]) {
        const groups: ConvertibleRow[][] = [];
        for (let i = 0; i < rows.length; i += groupSize) groups.push(rows.slice(i, i + groupSize));

        const groupTotalSum = groups.reduce((sum, g) => sum + sumConverted(g, display, bulkIndex).totalMinor, 0);
        const meta = currencyMeta(display);
        const unit = 10 ** (meta.exponent - meta.displayDigits);
        const toleranceMinor = Math.ceil(groups.length / 2) * unit;

        expect(Math.abs(periodTotal - groupTotalSum)).toBeLessThanOrEqual(toleranceMinor);
      }
    }
  });
});

describe("sumConvertedByDay — day axis", () => {
  // A quarter's worth of history, one row per currency per day.
  const spanDays = 90;
  const start = "2026-06-01";
  const dates = Array.from({ length: spanDays }, (_, i) => addDays(start, i));

  const dailyIndex = buildIndex({
    RUB: dates.map((date) => ({ date, rate: "0.01000000000000000000" })),
    USD: dates.map((date) => ({ date, rate: "1.00000000000000000000" })),
    EUR: dates.map((date) => ({ date, rate: "1.10000000000000000000" })),
    RSD: dates.map((date) => ({ date, rate: "0.00950000000000000000" })),
    BTC: dates.map((date) => ({ date, rate: "50000.00000000000000000000" })),
  });

  const rows: ConvertibleRow[] = dates.flatMap((date, i) =>
    CURRENCY_CODES.map((currency) => row({ amountMinor: 100_000 + i * 37, currency, spentAt: date })),
  );

  it("buckets consecutive same-day rows into one group per day, in order", () => {
    const buckets = sumConvertedByDay(rows, "RUB", dailyIndex);
    expect(buckets).toHaveLength(spanDays);
    expect(buckets[0].day).toBe(start);
    expect(buckets[spanDays - 1].day).toBe(addDays(start, spanDays - 1));
    expect(buckets.every((b) => b.items.length === CURRENCY_CODES.length)).toBe(true);
  });

  it("stays within the reconciliation tolerance against the period total, in all five display currencies (RSD included)", () => {
    for (const display of CURRENCY_CODES) {
      const { totalMinor: periodTotal } = sumConverted(rows, display, dailyIndex);

      const buckets = sumConvertedByDay(rows, display, dailyIndex);
      const bucketTotalSum = buckets.reduce((sum, b) => sum + b.totalMinor, 0);

      const meta = currencyMeta(display);
      const unit = 10 ** (meta.exponent - meta.displayDigits);
      const toleranceMinor = Math.ceil(buckets.length / 2) * unit;

      expect(Math.abs(periodTotal - bucketTotalSum)).toBeLessThanOrEqual(toleranceMinor);
    }
  });
});

describe("rateSnapshot / snapshotIndex", () => {
  it("rateSnapshot keeps each currency's rate in force on the day and leaves out a currency without one; snapshotIndex converts like the full index", () => {
    const day = "2026-09-10";
    const index = buildIndex({
      USD: [{ date: day, rate: "1" }],
      EUR: [
        { date: "2026-09-01", rate: "1.05" },
        { date: "2026-09-08", rate: "1.1" },
        { date: "2026-09-11", rate: "1.2" },
      ],
      RUB: [{ date: "2026-08-01", rate: "0.01234567890123456789" }],
      RSD: [{ date: "2026-09-11", rate: "0.0095" }],
    });

    const snapshot = rateSnapshot(index, day);
    expect(snapshot).toEqual({
      USD: "1.00000000000000000000",
      EUR: "1.10000000000000000000",
      RUB: "0.01234567890123456789",
    });

    const fromSnapshot = snapshotIndex(snapshot, day);
    const rows = [
      row({ amountMinor: 10_000, currency: "USD", spentAt: day }),
      row({ amountMinor: 9_200, currency: "EUR", spentAt: day }),
      row({ amountMinor: 1_234_567, currency: "RUB", spentAt: day }),
      row({ amountMinor: 300_000, currency: "RSD", spentAt: day }),
    ];
    for (const r of rows) {
      for (const display of CURRENCY_CODES) {
        expect(convertRow(r, display, fromSnapshot), `${r.currency}->${display}`).toBe(
          convertRow(r, display, index),
        );
      }
    }
    expect(convertRow(rows[1], "USD", fromSnapshot)).toBe(10_120);
    expect(convertRow(rows[3], "USD", fromSnapshot)).toBeNull();
  });
});
