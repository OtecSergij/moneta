import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { expenses, fxRates } from "@/db/schema";
import { CURRENCY_CODES } from "@/lib/currency";
import { isCurrentDate, maxEntryDate } from "@/lib/fx/provider";
import { CATEGORY_COLORS, createCategory } from "@/repositories/categories";
import { createExpense } from "@/repositories/expenses";
import {
  backfillRates,
  ensureRates,
  loadRateIndex,
  repairPendingOverrides,
} from "@/repositories/fx-rates";
import { callsTo, stubFxSources } from "@/test/fx-fixtures";
import { clearRates, mkExpense, mkUser } from "@/test/factories";

// Every fetch stub here routes by URL to a document of the real source's
// shape (src/test/fx-fixtures.ts). The ECB answer is a batch, so each test
// names the working days its file holds.

beforeEach(clearRates);

afterEach(() => {
  vi.restoreAllMocks();
});

async function rowsFor(date: string) {
  return db.select().from(fxRates).where(eq(fxRates.effectiveDate, date));
}

async function sourcesFor(date: string): Promise<Record<string, string>> {
  const rows = await rowsFor(date);
  return Object.fromEntries(rows.map((r) => [r.currency, r.source]));
}

describe("isCurrentDate / maxEntryDate — client can be a day ahead of the server (timezone boundary)", () => {
  it("treats today and any later date as current, but not yesterday", () => {
    // A fixed instant rather than `new Date()` — pins the boundary so the
    // test can't flake across a real midnight.
    const serverNow = new Date(2026, 5, 15);
    const yesterday = "2026-06-14";
    const serverToday = "2026-06-15";
    const tomorrow = "2026-06-16";

    expect(isCurrentDate(yesterday, serverNow)).toBe(false);
    expect(isCurrentDate(serverToday, serverNow)).toBe(true);
    // Deliberately unbounded above (`spentAt >= serverToday`): the upper
    // bound is enforced separately by maxEntryDate() at the one call site
    // that validates user input (quoteConversionAction). createExpense and
    // the @latest gate have no upstream validation to lean on here, matching
    // the pre-existing "no future-date check in the repository" design
    // (src/repositories/expenses.ts) — so isCurrentDate only answers "not
    // clearly in the past", not "within one day of today".
    expect(isCurrentDate(tomorrow, serverNow)).toBe(true);

    expect(maxEntryDate(serverNow)).toBe(tomorrow);
  });
});

describe("ensureRates", () => {
  it("composes the sources into all five currencies for a date, and a second call fetches nothing more (AC-14)", async () => {
    const date = "2024-10-10"; // Thursday
    const fetch = stubFxSources({
      ecbDates: ["2024-10-08", "2024-10-09", "2024-10-10"],
    });

    expect(await ensureRates(date, { fetch })).toBe(true);

    expect(await sourcesFor(date)).toEqual({
      RUB: "cbr",
      USD: "pivot",
      EUR: "ecb",
      RSD: "nbs",
      BTC: "jsdelivr",
    });
    const rows = await rowsFor(date);
    expect(rows.map((r) => r.currency).sort()).toEqual([...CURRENCY_CODES].sort());
    expect(rows.find((r) => r.currency === "USD")!.rateToUsd).toBe("1.00000000000000000000");

    const callsAfterFirstFill = fetch.mock.calls.length;
    expect(await ensureRates(date, { fetch })).toBe(true);
    expect(fetch.mock.calls.length).toBe(callsAfterFirstFill);
  });

  it("gives up on a slow source once the caller's budget runs out, without cancelling the fill", async () => {
    const date = "2025-11-19";
    let released!: () => void;
    const inFlight = new Promise<void>((resolve) => {
      released = resolve;
    });
    const fetch = vi.fn(async () => {
      await inFlight;
      throw new Error("slow source");
    });

    // The foreground callers (a save, the typing preview) pass a budget so a
    // stalled source costs a derivation, not the request. The fetch is not
    // aborted — it stays in flight and still fills the table for whoever
    // reads next.
    const started = Date.now();
    expect(await ensureRates(date, { fetch }, 50)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(fetch).toHaveBeenCalled();

    released();
  });

  it("a provider that always throws leaves fx_rates untouched and still resolves", async () => {
    const date = "2024-10-11";
    const fetch = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(ensureRates(date, { fetch })).resolves.toBe(false);
    expect(await rowsFor(date)).toEqual([]);
  });

  it("one source failing costs only its own currency: the other four are stored and the date reports a miss", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const date = "2025-08-06"; // Wednesday, own cluster
    // CBR is down and the aggregator has no ruble either — RUB is genuinely
    // unavailable, so this proves the miss is per currency, not per date.
    const fetch = stubFxSources({
      ecbDates: ["2025-08-04", "2025-08-05", "2025-08-06"],
      fail: ["cbr"],
      aggregatorRates: '"usd":1,"eur":0.923,"rsd":107.7,"btc":1.2692964e-05',
    });

    expect(await ensureRates(date, { fetch })).toBe(false);

    expect(await sourcesFor(date)).toEqual({
      USD: "pivot",
      EUR: "ecb",
      RSD: "nbs",
      BTC: "jsdelivr",
    });
  });

  it("the ECB batch covers neighbouring days, so nearby dates need no further ECB request, and a weekend carries Friday forward", async () => {
    const wednesday = "2025-09-24"; // own cluster
    const thursday = "2025-09-25";
    const saturday = "2025-09-27";
    const week = ["2025-09-22", "2025-09-23", "2025-09-24", "2025-09-25", "2025-09-26"];
    const fetch = stubFxSources({
      ecbDates: week,
      ecbRate: (d) => `1.1${d.slice(-2)}`,
    });

    expect(await ensureRates(wednesday, { fetch })).toBe(true);
    for (const day of week) {
      const [eur] = await db
        .select()
        .from(fxRates)
        .where(and(eq(fxRates.currency, "EUR"), eq(fxRates.effectiveDate, day)));
      expect(eur, day).toMatchObject({ source: "ecb" });
      expect(Number(eur.rateToUsd)).toBeCloseTo(Number(`1.1${day.slice(-2)}`), 10);
    }
    expect(callsTo(fetch, "ecb")).toHaveLength(1);

    expect(await ensureRates(thursday, { fetch })).toBe(true);
    expect(await ensureRates(saturday, { fetch })).toBe(true);
    expect(callsTo(fetch, "ecb")).toHaveLength(1);

    const [saturdayEur] = await db
      .select()
      .from(fxRates)
      .where(and(eq(fxRates.currency, "EUR"), eq(fxRates.effectiveDate, saturday)));
    expect(saturdayEur.source).toBe("ecb");
    expect(Number(saturdayEur.rateToUsd)).toBeCloseTo(1.126, 10);
  });
});

describe("backfillRates", () => {
  it("fills every distinct expense date for the user (AC-25)", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Food",
      color: CATEGORY_COLORS[0],
    });
    const dates = ["2024-11-01", "2024-11-02", "2024-11-03"]; // Fri, Sat, Sun
    for (const spentAt of dates) {
      await createExpense(u.id, {
        categoryId: cat.id,
        amountMinor: 1000,
        currency: "RUB",
        note: "трата",
        spentAt,
      });
    }

    const fetch = stubFxSources({
      ecbDates: ["2024-10-30", "2024-10-31", "2024-11-01"],
    });
    const filled = await backfillRates(u.id, { fetch });
    expect(filled).toBe(3);

    for (const date of dates) {
      expect(await rowsFor(date)).toHaveLength(5);
    }
  });

  it("between the floors a fiat-only date counts as covered, so it is filled once and never re-fetched", async () => {
    const u = await mkUser();
    const date = "2024-08-14"; // Wednesday: official sources yes, aggregator not yet
    await mkExpense(u.id, { spentAt: date });

    const fetch = stubFxSources({ ecbDates: ["2024-08-13", "2024-08-14"] });
    expect(await backfillRates(u.id, { fetch })).toBe(1);
    expect(callsTo(fetch, "aggregator")).toEqual([]);
    expect(await sourcesFor(date)).toEqual({
      RUB: "cbr",
      USD: "pivot",
      EUR: "ecb",
      RSD: "nbs",
    });

    // Four rows are all this date can ever have; expecting a fifth would
    // make every pass re-fetch it.
    const callsAfterFill = fetch.mock.calls.length;
    expect(await backfillRates(u.id, { fetch })).toBe(0);
    expect(fetch.mock.calls.length).toBe(callsAfterFill);
  });
});

describe("repairPendingOverrides", () => {
  it("derives rate_to_usd_override for a charged pair once its currency's rate exists (AC-27)", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Travel",
      color: CATEGORY_COLORS[1],
    });

    // $100 USD expense, actually charged as 9000 RUB, with fx_rates empty
    // for its date — the "pending" state AC-27 describes (rate_to_usd_override
    // stayed NULL because createExpense's derivation had nothing to read).
    // Inserted directly rather than through createExpense so the precondition
    // doesn't depend on network mocking or history-floor trickery — this
    // test is about repairPendingOverrides, not about how the row got into
    // the pending state.
    const [row] = await db
      .insert(expenses)
      .values({
        userId: u.id,
        categoryId: cat.id,
        amountMinor: 10000,
        currency: "USD",
        note: "поездка",
        spentAt: "2024-12-01",
        chargedAmountMinor: 900000,
        chargedCurrency: "RUB",
      })
      .returning();
    expect(row.rateToUsdOverride).toBeNull();
    expect(row.rateSource).toBeNull();

    // RUB's rate appears afterwards — 0.011 USD per RUB.
    await db.insert(fxRates).values({
      currency: "RUB",
      effectiveDate: "2024-12-01",
      rateToUsd: "0.011",
      source: "test",
    });

    const repaired = await repairPendingOverrides(u.id);
    expect(repaired).toBe(1);

    const [updated] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, row.id));
    expect(updated.rateSource).toBe("user");
    // override = (900000/100) * 0.011 / (10000/100) = 9000 * 0.011 / 100 = 0.99
    expect(Number(updated.rateToUsdOverride)).toBeCloseTo(0.99, 8);
  });

  it("skips a fixation dated below the sources' history floor instead of re-reading it forever", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Ancient",
      color: CATEGORY_COLORS[2],
    });
    const date = "2001-05-05"; // below OFFICIAL_HISTORY_FLOOR

    const [row] = await db
      .insert(expenses)
      .values({
        userId: u.id,
        categoryId: cat.id,
        amountMinor: 10000,
        currency: "USD",
        note: "древность",
        spentAt: date,
        chargedAmountMinor: 900000,
        chargedCurrency: "RUB",
      })
      .returning();

    // A usable rate is seeded on purpose: with it present, the only thing
    // that can explain a skip is the floor. backfillRates refuses to fill
    // below it, so in production these rows are pending forever — and each
    // repair pass would re-read and re-derive every one of them.
    await db.insert(fxRates).values({
      currency: "RUB",
      effectiveDate: date,
      rateToUsd: "0.03500000000000000000",
      source: "test",
    });

    expect(await repairPendingOverrides(u.id)).toBe(0);

    const [unchanged] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, row.id));
    expect(unchanged.rateToUsdOverride).toBeNull();
  });

  it("refuses a pair whose implied rate is outside the sane band, exactly as the write path does", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Absurd pending",
      color: CATEGORY_COLORS[4],
    });
    const date = "2025-06-15"; // own cluster, weeks from every other one

    // The same absurd fixation createExpense refuses to derive (0,01 ₽ against
    // $9 000 000 000 implies 9e11 USD per ruble). Without the band check here
    // the repair would happily "fix" the row with that nonsense rate — and a
    // pair one order of magnitude larger would overflow numeric(36,20) and
    // abort the whole pass, on every run.
    const [row] = await db
      .insert(expenses)
      .values({
        userId: u.id,
        categoryId: cat.id,
        amountMinor: 1,
        currency: "RUB",
        note: "абсурд",
        spentAt: date,
        chargedAmountMinor: 900_000_000_000,
        chargedCurrency: "USD",
      })
      .returning();

    await db.insert(fxRates).values({
      currency: "USD",
      effectiveDate: date,
      rateToUsd: "1.00000000000000000000",
      source: "test",
    });

    expect(await repairPendingOverrides(u.id)).toBe(0);

    const [unchanged] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, row.id));
    expect(unchanged.rateToUsdOverride).toBeNull();
    expect(unchanged.rateSource).toBeNull();
  });

  it("leaves rows with no available rate untouched and returns 0", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Other",
      color: CATEGORY_COLORS[2],
    });
    const [row] = await db
      .insert(expenses)
      .values({
        userId: u.id,
        categoryId: cat.id,
        amountMinor: 5000,
        currency: "EUR",
        note: "без курса",
        // Far from every other date this file seeds fx_rates for — RSD's
        // lookback window is 7 days, so an isolated date is the only way to
        // guarantee "no rate available" against a shared, un-truncated
        // fx_rates table (it has no user_id — see schema/fx-rates.ts).
        spentAt: "2025-01-15",
        chargedAmountMinor: 400000,
        chargedCurrency: "RSD",
      })
      .returning();

    expect(await repairPendingOverrides(u.id)).toBe(0);

    const [unchanged] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, row.id));
    expect(unchanged.rateToUsdOverride).toBeNull();
    expect(unchanged.rateSource).toBeNull();
  });
});

describe("ensureRates — the aggregator's @latest can answer with an earlier day's snapshot", () => {
  it("files aggregator rows under the payload's date, reports the requested date uncovered, and fills it on the next dated fetch", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // Isolated cluster, weeks away from every other date this run seeds — the
    // shared fx_rates table has no user_id (schema/fx-rates.ts) and the
    // lookback window is 7 days.
    const published = "2025-03-10";
    const requested = "2025-03-11";

    // Every official source down, so all four quotes come from the aggregator
    // — which, asked for the client's today, answers with the day it last
    // published (what @latest does one timezone east of the server).
    const latest = stubFxSources({
      fail: ["cbr", "ecb", "nbs"],
      aggregatorDate: () => published,
    });
    expect(await ensureRates(requested, { fetch: latest })).toBe(false);

    expect(await sourcesFor(published)).toEqual({
      RUB: "jsdelivr",
      EUR: "jsdelivr",
      RSD: "jsdelivr",
      BTC: "jsdelivr",
    });
    // Only the pivot — a definition, not a quote — sits under the requested
    // date; nothing dated by a source does.
    expect(await sourcesFor(requested)).toEqual({ USD: "pivot" });

    // Same date once the provider has published it for real. Only Date is
    // faked (the pg driver's own timers keep running) to step past the 60s
    // negative-cache window the miss above opened for `requested`.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 61_000));
    try {
      const dated = stubFxSources({ fail: ["cbr", "ecb", "nbs"] });
      expect(await ensureRates(requested, { fetch: dated })).toBe(true);
    } finally {
      vi.useRealTimers();
    }

    expect(await rowsFor(requested)).toHaveLength(5);
  });
});

describe("manual fixation — derivation needs the rate for the exact date", () => {
  it("stays pending while only the previous day's snapshot exists, then derives from the exact date", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Exact date",
      color: CATEGORY_COLORS[5],
    });
    const previousDay = "2025-11-10"; // own cluster, see the note above
    const spentAt = "2025-11-11";
    const offline = {
      fetch: vi.fn(async () => {
        throw new Error("no provider for this test");
      }),
    };

    await db.insert(fxRates).values({
      currency: "RUB",
      effectiveDate: previousDay,
      rateToUsd: "0.01000000000000000000",
      source: "test",
    });

    // The nearest-rate rule would have frozen the previous day's 0.01 onto
    // this row — a rate from a day the user did not transact on, and one that
    // nothing would ever revisit, since a derived override is only recomputed
    // when its own inputs change.
    const created = await createExpense(
      u.id,
      {
        categoryId: cat.id,
        amountMinor: 10000, // $100.00
        currency: "USD",
        chargedAmountMinor: 900000, // 9 000 ₽
        chargedCurrency: "RUB",
        note: "фиксация",
        spentAt,
      },
      offline,
    );
    expect(created!.rateToUsdOverride).toBeNull();
    expect(created!.rateSource).toBeNull();
    expect(await repairPendingOverrides(u.id)).toBe(0);

    await db.insert(fxRates).values({
      currency: "RUB",
      effectiveDate: spentAt,
      rateToUsd: "0.02000000000000000000",
      source: "test",
    });
    expect(await repairPendingOverrides(u.id)).toBe(1);

    const [repaired] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, created!.id));
    expect(repaired.rateSource).toBe("user");
    // override = (900000/100) * 0.02 / (10000/100) = 1.8 — the exact-date
    // rate. The previous day's 0.01 would have given 0.9.
    expect(Number(repaired.rateToUsdOverride)).toBeCloseTo(1.8, 8);
  });
});

describe("backfillRates then repairPendingOverrides — sequential passes converge in one round", () => {
  it("repairs a pending fixation only once backfill has completed first, not when raced", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Sequenced",
      color: CATEGORY_COLORS[3],
    });
    const date = "2026-08-01"; // Saturday; isolated cluster, unused elsewhere in this run

    // A plain single-currency expense, so backfillRates has a distinct
    // spentAt to work from.
    await createExpense(u.id, {
      categoryId: cat.id,
      amountMinor: 1000,
      currency: "RUB",
      note: "трата",
      spentAt: date,
    });

    // A pending fixation, inserted directly (fx_rates empty for `date` at
    // this point) — the AC-27 "rate table was empty" precondition.
    const [pendingRow] = await db
      .insert(expenses)
      .values({
        userId: u.id,
        categoryId: cat.id,
        amountMinor: 10000,
        currency: "USD",
        note: "поездка",
        spentAt: date,
        chargedAmountMinor: 900000,
        chargedCurrency: "RUB",
      })
      .returning();

    const fetch = stubFxSources({ ecbDates: ["2026-07-31"] });

    // The pre-fix race: repair runs before backfill has written anything for
    // `date`, so there is nothing yet to derive from.
    expect(await repairPendingOverrides(u.id)).toBe(0);

    // The fixed order: await backfill, then repair — converges in this pass
    // instead of needing a second currency switch (plan Step 4.5.4).
    expect(await backfillRates(u.id, { fetch })).toBeGreaterThan(0);
    expect(await repairPendingOverrides(u.id)).toBe(1);

    const [repaired] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, pendingRow.id));
    expect(repaired.rateSource).toBe("user");
    expect(repaired.rateToUsdOverride).not.toBeNull();
  });
});

describe("loadRateIndex", () => {
  it("returns every rate up to `to`, sorted ascending, with no lower bound", async () => {
    await db
      .insert(fxRates)
      .values([
        { currency: "RUB", effectiveDate: "2025-02-16", rateToUsd: "0.0110", source: "test" },
        { currency: "RUB", effectiveDate: "2025-02-18", rateToUsd: "0.0111", source: "test" },
      ])
      .onConflictDoNothing();

    const index = await loadRateIndex(["RUB"], "2025-02-18");
    const dates = index.get("RUB")!.map((p) => p.effectiveDate);

    // Rates older than the period must be reachable: rateFor may fall back to
    // any earlier one, which is why loadRateIndex takes no lower bound at all.
    expect(dates).toContain("2025-02-16");
    expect(dates).toContain("2025-02-18");
    expect(dates.every((d) => d <= "2025-02-18")).toBe(true);
    expect([...dates].sort()).toEqual(dates);
  });
});
