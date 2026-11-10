import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { fxRates } from "@/db/schema";
import { isCurrentDate, maxEntryDate } from "@/lib/fx/provider";
import { CATEGORY_COLORS, createCategory } from "@/repositories/categories";
import {
  backfillRates,
  ensureRates,
  loadRateIndex,
} from "@/repositories/fx-rates";
import { callsTo, stubFxSources } from "@/test/fx-fixtures";
import {
  clearRates,
  mkExpense,
  mkMember,
  mkSpaceUser,
} from "@/test/factories";

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
    // bound is enforced separately by maxEntryDate() where user input is
    // validated (quoteConversionAction, the expenses repository), so
    // isCurrentDate only answers "not clearly in the past", not "within one
    // day of today".
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

    // The foreground caller (the typing preview) passes a budget so a stalled
    // source costs this one response, not a stalled request. The fetch is not
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
  it("fills every distinct expense date of both members of the space (AC-25)", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const cat = await createCategory(owner.spaceId, owner.user.id, {
      name: "Food",
      color: CATEGORY_COLORS[0],
    });
    const dates = ["2024-11-01", "2024-11-02", "2024-11-03"]; // Fri, Sat, Sun
    const authors = [owner, member, member];
    for (const [i, spentAt] of dates.entries()) {
      await mkExpense(owner.spaceId, authors[i].user.id, {
        categoryId: cat.id,
        amountMinor: 1000,
        note: "трата",
        spentAt,
      });
    }

    const fetch = stubFxSources({
      ecbDates: ["2024-10-30", "2024-10-31", "2024-11-01"],
    });
    const filled = await backfillRates(owner.spaceId, { fetch });
    expect(filled).toBe(3);

    for (const date of dates) {
      expect(await rowsFor(date)).toHaveLength(5);
    }
  });

  it("between the floors a fiat-only date counts as covered, so it is filled once and never re-fetched", async () => {
    const u = await mkSpaceUser();
    const date = "2024-08-14"; // Wednesday: official sources yes, aggregator not yet
    await mkExpense(u.spaceId, u.user.id, { spentAt: date });

    const fetch = stubFxSources({ ecbDates: ["2024-08-13", "2024-08-14"] });
    expect(await backfillRates(u.spaceId, { fetch })).toBe(1);
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
    expect(await backfillRates(u.spaceId, { fetch })).toBe(0);
    expect(fetch.mock.calls.length).toBe(callsAfterFill);
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
