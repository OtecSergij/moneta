import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { fxRates } from "@/db/schema";
import { CURRENCY_CODES } from "@/lib/currency";
import { minEntryDate } from "@/lib/dates";
import { rateFor } from "@/lib/fx/convert";
import {
  fillRateGaps,
  loadRateIndex,
  loadRatesOn,
  loadTodayRates,
} from "@/repositories/fx-rates";
import { callsTo, stubFxSources } from "@/test/fx-fixtures";
import {
  clearRates,
  mkAccount,
  mkExpense,
  mkMember,
  mkRate,
  mkSpaceUser,
  mkTopUp,
  mkTransfer,
} from "@/test/factories";

// Every fetch stub here routes by URL to a document of the real source's
// shape (src/test/fx-fixtures.ts). The ECB answer is a batch, so each test
// names the working days its file holds.

beforeEach(clearRates);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function rowsFor(date: string) {
  return db.select().from(fxRates).where(eq(fxRates.effectiveDate, date));
}

async function sourcesFor(date: string): Promise<Record<string, string>> {
  const rows = await rowsFor(date);
  return Object.fromEntries(rows.map((r) => [r.currency, r.source]));
}

// The dates a stub was asked for, read off the NBS URLs (one per date).
function requestedDates(fetch: ReturnType<typeof stubFxSources>): string[] {
  return callsTo(fetch, "nbs").map((url) => url.slice(-10)).sort();
}

describe("loadTodayRates — the daily run", () => {
  it("stores all five currencies for the server's UTC today, asking the aggregator for that dated snapshot", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-06-10T16:00:00Z")); // Wednesday
    const today = "2026-06-10";
    const fetch = stubFxSources({ ecbDates: ["2026-06-08", "2026-06-09", today] });

    expect(await loadTodayRates(new Date(), { fetch })).toBe(true);

    expect(await sourcesFor(today)).toEqual({
      RUB: "cbr",
      USD: "pivot",
      EUR: "ecb",
      RSD: "nbs",
      BTC: "jsdelivr",
    });
    const rows = await rowsFor(today);
    expect(rows.find((r) => r.currency === "USD")!.rateToUsd).toBe("1.00000000000000000000");
    expect(callsTo(fetch, "aggregator")).toEqual([
      expect.stringContaining(`@${today}/`),
    ]);

    const callsAfterFirstRun = fetch.mock.calls.length;
    expect(await loadTodayRates(new Date(), { fetch })).toBe(true);
    expect(fetch.mock.calls.length).toBe(callsAfterFirstRun);
  });

  it("takes the UTC date, not the local one, as today", async () => {
    // Already 6 August in Belgrade. The ECB file ends on Monday, and Monday's
    // rate is not carried onto 5 August: for the providers it is today.
    const fetch = stubFxSources({ ecbDates: ["2025-08-04"] });
    await loadTodayRates(new Date("2025-08-05T23:30:00Z"), { fetch });
    expect(requestedDates(fetch)).toEqual(["2025-08-05"]);
    expect(await sourcesFor("2025-08-05")).not.toHaveProperty("EUR");
  });

  it("on a Saturday stores no EUR, takes RSD from the aggregator while NBS still serves Friday's list, and logs neither", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const saturday = "2025-08-09";
    const friday = "2025-08-08";
    const fetch = stubFxSources({
      ecbDates: ["2025-08-04", "2025-08-05", "2025-08-06", "2025-08-07", friday],
      nbsDateFrom: () => friday,
    });

    expect(await loadTodayRates(new Date(`${saturday}T16:00:00Z`), { fetch })).toBe(false);

    expect(await sourcesFor(saturday)).toEqual({
      RUB: "cbr",
      USD: "pivot",
      RSD: "jsdelivr",
      BTC: "jsdelivr",
    });
    expect(callsTo(fetch, "aggregator")).toEqual([
      expect.stringContaining(`@${saturday}/`),
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("a provider that always throws leaves fx_rates untouched, resolves, and logs the date once with the reason", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const date = "2024-10-11";
    const fetch = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(loadTodayRates(new Date(`${date}T16:00:00Z`), { fetch })).resolves.toBe(false);
    expect(await rowsFor(date)).toEqual([]);
    expect(warn.mock.calls.filter((call) => call[0] === "fx.load_failed")).toEqual([
      ["fx.load_failed", date, "no rate for RUB, USD, EUR, RSD, BTC"],
    ]);
  });

  it("one source failing costs only its own currency: the other four are stored and the date reports a miss", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const date = "2025-08-06"; // Wednesday, own cluster
    // CBR is down and the aggregator has no ruble either — RUB is genuinely
    // unavailable, so this proves the miss is per currency, not per date.
    const fetch = stubFxSources({
      ecbDates: ["2025-08-04", "2025-08-05", "2025-08-06"],
      fail: ["cbr"],
      aggregatorRates: '"usd":1,"eur":0.923,"rsd":107.7,"btc":1.2692964e-05',
    });

    expect(await loadTodayRates(new Date(`${date}T16:00:00Z`), { fetch })).toBe(false);

    expect(await sourcesFor(date)).toEqual({
      USD: "pivot",
      EUR: "ecb",
      RSD: "nbs",
      BTC: "jsdelivr",
    });
    expect(warn).toHaveBeenCalledWith("fx.load_failed", date, "no rate for RUB");
  });

  it("files aggregator rows under the payload's own date and reports the requested date uncovered", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const published = "2025-03-10";
    const requested = "2025-03-11";
    const fetch = stubFxSources({
      fail: ["cbr", "ecb", "nbs"],
      aggregatorDate: () => published,
    });

    expect(await loadTodayRates(new Date(`${requested}T16:00:00Z`), { fetch })).toBe(false);

    expect(await sourcesFor(published)).toEqual({
      RUB: "jsdelivr",
      EUR: "jsdelivr",
      RSD: "jsdelivr",
      BTC: "jsdelivr",
    });
    expect(await sourcesFor(requested)).toEqual({ USD: "pivot" });
  });
});

describe("fillRateGaps — the nightly gap pass", () => {
  // Window for this instant: 2025-03-30 .. 2025-06-29, server UTC.
  const now = new Date("2025-06-30T02:00:00Z");
  const from = "2025-03-30";
  const to = "2025-06-29";

  it("loads the uncovered entry dates of every space and table inside the window, and nothing else", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const stranger = await mkSpaceUser();
    const account = await mkAccount(owner.spaceId, owner.user.id);
    const usd = await mkAccount(owner.spaceId, owner.user.id, { currency: "USD" });

    await mkExpense(owner.spaceId, owner.user.id, { spentAt: from });
    await mkExpense(owner.spaceId, member.user.id, { spentAt: "2025-05-05" });
    await mkTopUp(owner.spaceId, owner.user.id, { accountId: account.id, occurredOn: "2025-05-06" });
    await mkTransfer(owner.spaceId, owner.user.id, {
      fromAccountId: account.id,
      toAccountId: usd.id,
      enteredOn: to,
    });
    await mkExpense(stranger.spaceId, stranger.user.id, { spentAt: "2025-05-07" });

    await mkExpense(owner.spaceId, owner.user.id, { spentAt: "2025-03-29" });
    await mkTopUp(owner.spaceId, owner.user.id, { accountId: account.id, occurredOn: "2025-06-30" });

    const covered = "2025-05-08";
    await mkExpense(stranger.spaceId, stranger.user.id, { spentAt: covered });
    for (const currency of CURRENCY_CODES) {
      await mkRate({ currency, effectiveDate: covered });
    }

    const fetch = stubFxSources({ ecbDates: ["2025-03-28"] });
    await fillRateGaps(now, { fetch });

    const requested = requestedDates(fetch);
    expect(requested).toEqual(expect.arrayContaining([from, "2025-05-05", "2025-05-06", "2025-05-07", to]));
    expect(requested.every((d) => d >= from && d <= to)).toBe(true);
    expect(requested).not.toContain(covered);
    for (const date of [from, "2025-05-05", "2025-05-06", "2025-05-07", to]) {
      expect(await rowsFor(date), date).toHaveLength(5);
    }
    expect(await rowsFor("2025-03-29")).toEqual([]);
    expect(await rowsFor("2025-06-30")).toEqual([]);
    expect(await sourcesFor(covered)).toEqual(
      Object.fromEntries(CURRENCY_CODES.map((c) => [c, "test"])),
    );
  });

  it("fills an entry dated at the form's lower bound the day before the pass, by a client west of UTC", async () => {
    // 29 June 08:00 UTC, after that night's pass, is still 28 June at UTC−10.
    const lowerBound = minEntryDate(new Date(2025, 5, 28, 22));
    expect(lowerBound).toBe("2025-03-30");
    const u = await mkSpaceUser();
    await mkExpense(u.spaceId, u.user.id, { spentAt: lowerBound });

    const fetch = stubFxSources({ ecbDates: ["2025-03-28"] });
    await fillRateGaps(now, { fetch });

    expect(requestedDates(fetch)).toContain(lowerBound);
    expect(await rowsFor(lowerBound)).toHaveLength(5);
  });

  it("a date left short is loaded again by the next pass", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const u = await mkSpaceUser();
    const date = "2025-06-11";
    await mkExpense(u.spaceId, u.user.id, { spentAt: date });

    const down = stubFxSources({
      ecbDates: [date],
      fail: ["cbr"],
      aggregatorRates: '"usd":1,"eur":0.923,"rsd":107.7,"btc":1.2692964e-05',
    });
    await fillRateGaps(now, { fetch: down });
    expect(await rowsFor(date)).toHaveLength(4);

    const up = stubFxSources({ ecbDates: [date] });
    await fillRateGaps(now, { fetch: up });
    expect(requestedDates(up)).toContain(date);
    expect(await rowsFor(date)).toHaveLength(5);
  });

  it("the ECB batch covers neighbouring days, so nearby dates share one ECB request, and a weekend carries Friday forward", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const u = await mkSpaceUser();
    const wednesday = "2025-06-18";
    const thursday = "2025-06-19";
    const saturday = "2025-06-21";
    for (const spentAt of [wednesday, thursday, saturday]) {
      await mkExpense(u.spaceId, u.user.id, { spentAt });
    }
    const week = ["2025-06-16", "2025-06-17", "2025-06-18", "2025-06-19", "2025-06-20"];
    const fetch = stubFxSources({
      ecbDates: week,
      ecbRate: (d) => `1.1${d.slice(-2)}`,
    });

    await fillRateGaps(now, { fetch });

    for (const day of week) {
      const [eur] = await db
        .select()
        .from(fxRates)
        .where(and(eq(fxRates.currency, "EUR"), eq(fxRates.effectiveDate, day)));
      expect(eur, day).toMatchObject({ source: "ecb" });
      expect(Number(eur.rateToUsd)).toBeCloseTo(Number(`1.1${day.slice(-2)}`), 10);
    }
    // Entry dates other tests leave in the window may add a full-history
    // download; the 90-day file is what these three dates share.
    expect(callsTo(fetch, "ecb").filter((url) => url.includes("hist-90d"))).toHaveLength(1);

    const [saturdayEur] = await db
      .select()
      .from(fxRates)
      .where(and(eq(fxRates.currency, "EUR"), eq(fxRates.effectiveDate, saturday)));
    expect(saturdayEur.source).toBe("ecb");
    expect(Number(saturdayEur.rateToUsd)).toBeCloseTo(1.12, 10);
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

describe("loadRatesOn", () => {
  it("keeps only each currency's latest rate on or before the date, as rateFor would pick it", async () => {
    await mkRate({ currency: "RUB", effectiveDate: "2025-02-16", rateToUsd: "0.0110" });
    await mkRate({ currency: "RUB", effectiveDate: "2025-02-18", rateToUsd: "0.0111" });
    await mkRate({ currency: "RUB", effectiveDate: "2025-02-20", rateToUsd: "0.0112" });
    await mkRate({ currency: "EUR", effectiveDate: "2025-01-10", rateToUsd: "1.04" });
    await mkRate({ currency: "USD", effectiveDate: "2025-02-20", rateToUsd: "1" });

    const on = "2025-02-19";
    const index = await loadRatesOn(["RUB", "EUR", "USD"], on);

    expect(index.get("RUB")!.map((p) => p.effectiveDate)).toEqual(["2025-02-18"]);
    expect(index.get("EUR")!.map((p) => p.effectiveDate)).toEqual(["2025-01-10"]);
    expect(index.get("USD")).toEqual([]);

    const full = await loadRateIndex(["RUB", "EUR", "USD"], "2025-02-20");
    for (const currency of ["RUB", "EUR", "USD"] as const) {
      expect(rateFor(index, currency, on)).toBe(rateFor(full, currency, on));
    }
  });
});
