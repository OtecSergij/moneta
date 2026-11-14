import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { todayISO } from "@/lib/dates";
import {
  OFFICIAL_HISTORY_FLOOR,
  PROVIDER_HISTORY_FLOOR,
  fetchAggregatorRates,
  fetchEurToUsdRange,
  fetchRates,
  fetchRsdToUsd,
  fetchRubToUsd,
  fetchableCurrencies,
  type FxDeps,
} from "@/lib/fx/provider";
import {
  aggregatorPayload,
  callsTo,
  cbrDocument,
  ecbDocument,
  nbsPayload,
  stubFxSources,
} from "@/test/fx-fixtures";

// Fresh Response per call — `deps.fetch` may be invoked more than once in a
// test (primary + mirror, or two separate calls), and a Response body can
// only be read once.
function stubFetch(body: BodyInit, status = 200): FxDeps["fetch"] {
  return vi.fn(async () => new Response(body, { status })) as unknown as FxDeps["fetch"];
}

function calls(fetch: FxDeps["fetch"]): [string, RequestInit | undefined][] {
  return (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(
    (call) => [String(call[0]), call[1] as RequestInit | undefined],
  );
}

const TWENTY_DIGIT_DECIMAL = /^\d+\.\d{20}$/;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("floors", () => {
  it("fetchableCurrencies narrows with the date: pivot only, then fiat, then BTC as well", () => {
    expect(fetchableCurrencies("2002-12-31")).toEqual(["USD"]);
    expect(fetchableCurrencies(OFFICIAL_HISTORY_FLOOR)).toEqual(["RUB", "USD", "EUR", "RSD"]);
    expect(fetchableCurrencies("2024-09-30")).toEqual(["RUB", "USD", "EUR", "RSD"]);
    expect(fetchableCurrencies(PROVIDER_HISTORY_FLOOR)).toEqual(["RUB", "USD", "EUR", "RSD", "BTC"]);
  });

  it("no official source is asked below its floor, and the aggregator below its own", async () => {
    const fetch = vi.fn();
    const belowOfficial = "2002-12-31";
    expect(await fetchRubToUsd(belowOfficial, { fetch })).toBeNull();
    expect(await fetchEurToUsdRange(belowOfficial, { fetch })).toBeNull();
    expect(await fetchRsdToUsd(belowOfficial, { fetch })).toBeNull();
    expect(await fetchAggregatorRates("2024-09-30", { fetch })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("fetchRubToUsd — Central Bank of Russia", () => {
  it("decodes the windows-1251 document, reads the decimal comma and inverts Value/Nominal", async () => {
    const fetch = stubFetch(cbrDocument({ date: "2026-09-04", usdValue: "86,3793" }));
    const rate = await fetchRubToUsd("2026-09-04", { fetch });

    expect(rate).toMatch(TWENTY_DIGIT_DECIMAL);
    expect(Number(rate)).toBeCloseTo(1 / 86.3793, 10);

    const [[url, init]] = calls(fetch);
    expect(url).toBe("https://www.cbr.ru/scripts/XML_daily.asp?date_req=04/09/2026");
    // Every request carries an abort signal — Node's fetch
    // has no default timeout.
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("divides by Nominal — a Nominal of 100 with a 100x Value is the same rate", async () => {
    const perUnit = await fetchRubToUsd("2026-09-04", {
      fetch: stubFetch(cbrDocument({ date: "2026-09-04", usdValue: "86,3793", usdNominal: 1 })),
    });
    const perHundred = await fetchRubToUsd("2026-09-04", {
      fetch: stubFetch(cbrDocument({ date: "2026-09-04", usdValue: "8637,93", usdNominal: 100 })),
    });
    expect(perHundred).toBe(perUnit);
  });

  it("accepts the list in force on a non-business day, dated earlier than requested", async () => {
    // Sunday 6 Sept: CBR answers with Friday's list, which is what the bank
    // applies to the weekend.
    const fetch = stubFetch(cbrDocument({ date: "2026-09-04" }));
    const rate = await fetchRubToUsd("2026-09-06", { fetch });
    expect(rate).not.toBeNull();
    expect(calls(fetch)[0][0]).toContain("date_req=06/09/2026");
  });

  it("refuses a list dated after the requested day", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = stubFetch(cbrDocument({ date: "2026-09-07" }));
    expect(await fetchRubToUsd("2026-09-06", { fetch })).toBeNull();
  });

  it("rejects a zero, absurd or missing USD entry, and a failed request", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const zero = stubFetch(cbrDocument({ date: "2026-09-04", usdValue: "0,0000" }));
    expect(await fetchRubToUsd("2026-09-04", { fetch: zero })).toBeNull();

    // 1 / 1e15 = 1e-15, below the 1e-9 band floor.
    const absurd = stubFetch(cbrDocument({ date: "2026-09-04", usdValue: "1000000000000000,0000" }));
    expect(await fetchRubToUsd("2026-09-04", { fetch: absurd })).toBeNull();

    const missing = stubFetch(cbrDocument({ date: "2026-09-04", omitUsd: true }));
    expect(await fetchRubToUsd("2026-09-04", { fetch: missing })).toBeNull();

    const html = stubFetch("<html>maintenance</html>");
    expect(await fetchRubToUsd("2026-09-04", { fetch: html })).toBeNull();

    const down = stubFetch("", 503);
    expect(await fetchRubToUsd("2026-09-04", { fetch: down })).toBeNull();

    const thrown = vi.fn().mockRejectedValue(new Error("network down"));
    expect(await fetchRubToUsd("2026-09-04", { fetch: thrown })).toBeNull();
  });
});

describe("fetchEurToUsdRange — European Central Bank", () => {
  const week = [
    { date: "2026-06-08", usd: "1.1601" },
    { date: "2026-06-09", usd: "1.1602" },
    { date: "2026-06-10", usd: "1.1603" },
    { date: "2026-06-11", usd: "1.1604" },
    { date: "2026-06-12", usd: "1.1605" },
  ];

  it("parses the double-quoted historical files and the single-quoted daily one alike", async () => {
    for (const quote of ['"', "'"] as const) {
      const fetch = stubFetch(ecbDocument(week, quote));
      const rows = await fetchEurToUsdRange("2026-06-10", { fetch });
      expect(rows).toHaveLength(5);
      expect(rows!.find((p) => p.effectiveDate === "2026-06-10")!.rateToUsd).toBe(
        "1.16030000000000000000",
      );
    }
  });

  it("yields every working day the 90-day file contains, ascending", async () => {
    const fetch = stubFetch(ecbDocument(week));
    const rows = await fetchEurToUsdRange("2026-06-10", { fetch });
    expect(rows!.map((p) => p.effectiveDate)).toEqual(week.map((p) => p.date));
    expect(calls(fetch).map(([url]) => url)).toEqual([
      "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml",
    ]);
  });

  it("resolves a weekend request to the preceding working day, filed under the requested date", async () => {
    const fetch = stubFetch(ecbDocument(week));
    const rows = await fetchEurToUsdRange("2026-06-13", { fetch }); // Saturday
    expect(rows).toHaveLength(6);
    expect(rows![5]).toEqual({
      effectiveDate: "2026-06-13",
      rateToUsd: "1.16050000000000000000",
    });
  });

  it("leaves today uncovered instead of carrying yesterday's rate onto it", async () => {
    const today = todayISO();
    const fetch = stubFetch(ecbDocument([{ date: "2020-01-02", usd: "1.1" }]));
    // A far-past single point: whatever today is, the file lacks it.
    const rows = await fetchEurToUsdRange(today, { fetch });
    expect(rows).not.toBeNull();
    expect(rows!.some((p) => p.effectiveDate === today)).toBe(false);
  });

  it("requests the full history only for a date older than the 90-day window, and only once", async () => {
    const history = [
      { date: "2020-03-12", usd: "1.1240" },
      { date: "2020-03-13", usd: "1.1104" },
      { date: "2020-03-16", usd: "1.1157" },
      ...week,
    ];
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
      new Response(ecbDocument(String(url).includes("hist-90d") ? week : history), {
        status: 200,
      }),
    );

    await fetchEurToUsdRange("2026-06-10", { fetch });
    expect(fetch).toHaveBeenCalledTimes(1);

    const old = await fetchEurToUsdRange("2020-03-15", { fetch }); // Sunday
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(String(fetch.mock.calls[1][0])).toContain("eurofxref-hist.xml");
    // The multi-megabyte file gets a longer budget than the small ones.
    expect(fetch.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
    // Only the span around the requested date, not the whole history.
    expect(old!.map((p) => p.effectiveDate)).toEqual([
      "2020-03-12",
      "2020-03-13",
      "2020-03-16",
      "2020-03-15",
    ]);
    expect(old![3].rateToUsd).toBe("1.11040000000000000000");

    await fetchEurToUsdRange("2020-03-14", { fetch });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("skips a garbage rate and treats a document without rates as a failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const mixed = stubFetch(
      ecbDocument([
        { date: "2026-06-10", usd: "1.1603" },
        { date: "2026-06-11", usd: "abc" },
        { date: "2026-06-12", usd: "-1" },
        { date: "2026-06-15", usd: "1e5" },
        { date: "2026-06-16", usd: "1000000000000000" },
      ]),
    );
    const rows = await fetchEurToUsdRange("2026-06-10", { fetch: mixed });
    expect(rows!.map((p) => p.effectiveDate)).toEqual(["2026-06-10"]);

    const empty = stubFetch(ecbDocument([]));
    expect(await fetchEurToUsdRange("2026-06-10", { fetch: empty })).toBeNull();

    const down = stubFetch("", 503);
    expect(await fetchEurToUsdRange("2026-06-10", { fetch: down })).toBeNull();
  });

  describe("in-process cache", () => {
    beforeAll(() => {
      vi.useFakeTimers();
    });

    afterAll(() => {
      vi.useRealTimers();
    });

    it("serves many dates from one download and refetches after an hour", async () => {
      const fetch = stubFetch(ecbDocument(week));
      await fetchEurToUsdRange("2026-06-09", { fetch });
      await fetchEurToUsdRange("2026-06-10", { fetch });
      await fetchEurToUsdRange("2026-06-11", { fetch });
      expect(fetch).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(61 * 60 * 1000);
      await fetchEurToUsdRange("2026-06-11", { fetch });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("does not let a failed download occupy the cache", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const fetch = vi
        .fn()
        .mockResolvedValueOnce(new Response("", { status: 503 }))
        .mockResolvedValueOnce(new Response(ecbDocument(week), { status: 200 }));
      expect(await fetchEurToUsdRange("2026-06-10", { fetch })).toBeNull();
      expect(await fetchEurToUsdRange("2026-06-10", { fetch })).toHaveLength(5);
    });
  });
});

describe("fetchRsdToUsd — National Bank of Serbia via kurs.resenje.org", () => {
  it("inverts exchange_middle / parity", async () => {
    const perUnit = stubFetch(nbsPayload({ date: "2026-09-01", middle: 101.0794, parity: 1 }));
    const rate = await fetchRsdToUsd("2026-09-01", { fetch: perUnit });
    expect(rate).toMatch(TWENTY_DIGIT_DECIMAL);
    expect(Number(rate)).toBeCloseTo(1 / 101.0794, 10);
    expect(calls(perUnit)[0][0]).toBe(
      "https://kurs.resenje.org/api/v1/currencies/usd/rates/2026-09-01",
    );

    const perHundred = stubFetch(nbsPayload({ date: "2026-09-01", middle: 6.8, parity: 100 }));
    expect(Number(await fetchRsdToUsd("2026-09-01", { fetch: perHundred }))).toBeCloseTo(
      1 / 0.068,
      10,
    );
  });

  it("accepts a list in force since an earlier day, but not one from a later day", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const inForce = stubFetch(nbsPayload({ date: "2026-09-06", dateFrom: "2026-09-04" }));
    expect(await fetchRsdToUsd("2026-09-06", { fetch: inForce })).not.toBeNull();

    const later = stubFetch(nbsPayload({ date: "2026-09-06", dateFrom: "2026-09-07" }));
    expect(await fetchRsdToUsd("2026-09-06", { fetch: later })).toBeNull();
  });

  it("rejects a garbage or missing field rather than storing it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cases: Array<{ middle?: unknown; parity?: unknown }> = [
      { middle: "101.0794" },
      { middle: undefined },
      { middle: 0 },
      { middle: -5 },
      { middle: 1e15 },
      { parity: 0 },
      { parity: "1" },
    ];
    for (const c of cases) {
      const fetch = stubFetch(nbsPayload({ date: "2026-09-01", ...c }));
      expect(await fetchRsdToUsd("2026-09-01", { fetch }), JSON.stringify(c)).toBeNull();
    }

    const notFound = stubFetch('{"message":"Rate Not Found","code":404}', 404);
    expect(await fetchRsdToUsd("2026-09-01", { fetch: notFound })).toBeNull();

    const notJson = stubFetch("<html>maintenance</html>");
    expect(await fetchRsdToUsd("2026-09-01", { fetch: notJson })).toBeNull();
  });
});

describe("fetchAggregatorRates — BTC, and the fallback for fiat", () => {
  const DAILY_FIXTURE_TEXT = aggregatorPayload("2024-10-05");

  it("inverts usd -> X into rate_to_usd, including BTC's scientific-notation value", async () => {
    const fetch = stubFetch(DAILY_FIXTURE_TEXT);
    const result = await fetchAggregatorRates("2024-10-05", { fetch });

    expect(result).not.toBeNull();
    expect(result!.date).toBe("2024-10-05");
    expect(result!.source).toBe("jsdelivr");
    expect("USD" in result!.rates).toBe(false);
    expect(Number(result!.rates.RUB)).toBeCloseTo(1 / 96.5, 10);
    expect(Number(result!.rates.EUR)).toBeCloseTo(1 / 0.923, 10);
    expect(Number(result!.rates.RSD)).toBeCloseTo(1 / 107.7, 10);
    expect(Number(result!.rates.BTC)).toBeCloseTo(1 / 1.2692964e-5, 2);
    expect(calls(fetch)[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects zero, out-of-range and non-numeric rates but keeps the valid ones", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // rsd: 1 / 1e15 = 1e-15, below MIN_RATE.
    const fetch = stubFetch(
      aggregatorPayload(undefined, '"usd":1,"rub":96.5,"eur":0,"rsd":1e15,"btc":"not-a-number"'),
    );
    const result = await fetchAggregatorRates("2024-10-05", { fetch });

    expect(result!.rates.RUB).toBeDefined();
    expect(result!.rates.EUR).toBeUndefined();
    expect(result!.rates.RSD).toBeUndefined();
    expect(result!.rates.BTC).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith(
      "fx.invalid_rate",
      expect.objectContaining({ currency: "EUR" }),
    );
  });

  it("reports the payload's own date, not the requested one", async () => {
    // What @latest actually does around the UTC date boundary: asked for the
    // client's today, it answers with the last published day. The caller needs
    // that date to file the rows under, so it can't be swallowed here.
    const fetch = stubFetch(DAILY_FIXTURE_TEXT);
    const result = await fetchAggregatorRates("2024-10-06", { fetch });

    expect(result!.date).toBe("2024-10-05");
    expect(result!.rates.RUB).toBeDefined();
  });

  it("falls back to the requested date when a dated payload carries none", async () => {
    const fetch = stubFetch(aggregatorPayload(undefined));
    const result = await fetchAggregatorRates("2024-10-06", { fetch });
    expect(result!.date).toBe("2024-10-06");
  });

  it("falls back to the mirror when the primary host fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("primary down"))
      .mockResolvedValueOnce(new Response(DAILY_FIXTURE_TEXT, { status: 200 }));
    const result = await fetchAggregatorRates("2024-10-05", { fetch });

    expect(result!.rates.RUB).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toContain("cdn.jsdelivr.net");
    expect(fetch.mock.calls[1][0]).toContain("currency-api.pages.dev");
  });

  it("returns null when both the primary and the mirror fail", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = stubFetch("", 500);
    expect(await fetchAggregatorRates("2024-10-05", { fetch })).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("uses the @latest tag for today (labelled as such), and the literal date for a past day", async () => {
    const todayFetch = stubFetch(aggregatorPayload(todayISO()));
    const today = await fetchAggregatorRates(todayISO(), { fetch: todayFetch });
    expect(calls(todayFetch)[0][0]).toContain("@latest");
    expect(today!.source).toBe("jsdelivr-latest");

    const pastFetch = stubFetch(DAILY_FIXTURE_TEXT);
    const past = await fetchAggregatorRates("2024-10-05", { fetch: pastFetch });
    const pastUrl = calls(pastFetch)[0][0];
    expect(pastUrl).toContain("@2024-10-05");
    expect(pastUrl).not.toContain("latest");
    expect(past!.source).toBe("jsdelivr");
  });

  it("refuses a @latest payload without a date rather than guessing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = stubFetch(aggregatorPayload(undefined));
    expect(await fetchAggregatorRates(todayISO(), { fetch })).toBeNull();
  });
});

describe("fetchRates — composition of the sources", () => {
  const date = "2026-06-10"; // Wednesday
  const ecbDates = ["2026-06-08", "2026-06-09", "2026-06-10"];

  function bySource(rows: Awaited<ReturnType<typeof fetchRates>>) {
    return Object.fromEntries(rows.map((r) => [`${r.currency}@${r.effectiveDate}`, r.source]));
  }

  it("takes each fiat from its official source, BTC from the aggregator, USD as the pivot", async () => {
    const fetch = stubFxSources({ ecbDates });
    const rows = await fetchRates(date, { fetch });

    expect(bySource(rows)).toEqual({
      "RUB@2026-06-10": "cbr",
      "RSD@2026-06-10": "nbs",
      "EUR@2026-06-08": "ecb",
      "EUR@2026-06-09": "ecb",
      "EUR@2026-06-10": "ecb",
      "BTC@2026-06-10": "jsdelivr",
      "USD@2026-06-10": "pivot",
    });
    expect(rows.find((r) => r.currency === "USD")!.rateToUsd).toBe("1.00000000000000000000");
    for (const source of ["cbr", "ecb", "nbs", "aggregator"] as const) {
      expect(callsTo(fetch, source)).toHaveLength(1);
    }
  });

  it("falls back to the aggregator for a currency whose official source failed, and says so", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = stubFxSources({ ecbDates, fail: ["cbr"] });
    const rows = await fetchRates(date, { fetch });

    expect(bySource(rows)).toMatchObject({
      "RUB@2026-06-10": "jsdelivr",
      "RSD@2026-06-10": "nbs",
      "EUR@2026-06-10": "ecb",
      "BTC@2026-06-10": "jsdelivr",
      "USD@2026-06-10": "pivot",
    });
    expect(Number(rows.find((r) => r.currency === "RUB")!.rateToUsd)).toBeCloseTo(1 / 96.5, 10);
  });

  it("files a fallback under the aggregator payload's own date, an official row under the requested one", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = stubFxSources({
      ecbDates,
      fail: ["nbs"],
      aggregatorDate: () => "2026-06-09",
    });
    const rows = await fetchRates(date, { fetch });
    expect(bySource(rows)).toMatchObject({
      "RUB@2026-06-10": "cbr",
      "RSD@2026-06-09": "jsdelivr",
      "BTC@2026-06-09": "jsdelivr",
      "USD@2026-06-10": "pivot",
    });
  });

  it("loses only the currency whose every source failed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = stubFxSources({
      ecbDates,
      fail: ["cbr"],
      aggregatorRates: '"usd":1,"eur":0.923,"rsd":107.7,"btc":1.2692964e-05',
    });
    const rows = await fetchRates(date, { fetch });
    expect(rows.map((r) => r.currency).sort()).toEqual(["BTC", "EUR", "EUR", "EUR", "RSD", "USD"]);
  });

  it("writes nothing at all when every source is down — not even the pivot", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = stubFxSources({ fail: ["cbr", "ecb", "nbs", "aggregator"] });
    expect(await fetchRates(date, { fetch })).toEqual([]);
  });

  it("between the floors, asks only the official sources and expects no BTC", async () => {
    const between = "2024-08-14";
    const fetch = stubFxSources({ ecbDates: ["2024-08-13", "2024-08-14"] });
    const rows = await fetchRates(between, { fetch });

    expect(callsTo(fetch, "aggregator")).toEqual([]);
    expect(rows.map((r) => r.currency).sort()).toEqual(["EUR", "EUR", "RSD", "RUB", "USD"]);
  });
});
