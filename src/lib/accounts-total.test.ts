import { describe, expect, it } from "vitest";
import { type AccountBalance, summarizeAccounts } from "@/lib/accounts-total";
import type { CurrencyCode } from "@/lib/currency";
import { FIXED_RATE_DATE, fixedRateIndex } from "@/test/fx-fixtures";

const TODAY = FIXED_RATE_DATE;
const index = fixedRateIndex();

function acc(
  name: string,
  currency: CurrencyCode,
  balanceMinor: number,
): AccountBalance {
  return { id: name, name, currency, balanceMinor };
}

const SEED = [
  acc("Карта USD", "USD", 124050),
  acc("Наличные RSD", "RSD", 4830000),
  acc("Наличные EUR", "EUR", 62000),
];

describe("summarizeAccounts", () => {
  it.each<[CurrencyCode, number]>([
    ["USD", 240550],
    ["RUB", 19244000],
    ["EUR", 218682],
    ["RSD", 24055000],
    ["BTC", 2405500],
  ])("totals the seed accounts in %s", (display, totalMinor) => {
    const s = summarizeAccounts(SEED, display, index, TODAY);
    expect(s.totalMinor).toBe(totalMinor);
    expect(s.unconverted).toBe(0);
  });

  it("keeps the exact balance when the account is in the display currency", () => {
    const s = summarizeAccounts([acc("Карта", "EUR", 62001)], "EUR", index, TODAY);
    expect(s.rows[0].convertedMinor).toBe(62001);
    expect(s.totalMinor).toBe(62001);
  });

  it("sorts by converted amount descending with tone by rank", () => {
    const s = summarizeAccounts(SEED, "USD", index, TODAY);
    expect(s.rows.map((r) => [r.name, r.convertedMinor, r.toneIndex])).toEqual([
      ["Карта USD", 124050, 0],
      ["Наличные EUR", 68200, 1],
      ["Наличные RSD", 48300, 2],
    ]);
  });

  it("breaks ties by name", () => {
    const s = summarizeAccounts(
      [acc("Б", "USD", 8000), acc("А", "RUB", 640000)],
      "USD",
      index,
      TODAY,
    );
    expect(s.rows.map((r) => r.name)).toEqual(["А", "Б"]);
  });

  it("counts an account without a rate as unconverted and puts it last", () => {
    const partial = fixedRateIndex({ USD: "1", EUR: "1.1" });
    const s = summarizeAccounts(
      [acc("Рубли", "RUB", 1_000_000_00), ...SEED.filter((a) => a.currency !== "RSD")],
      "USD",
      partial,
      TODAY,
    );
    expect(s.unconverted).toBe(1);
    expect(s.totalMinor).toBe(124050 + 68200);
    expect(s.rows.map((r) => r.name)).toEqual(["Карта USD", "Наличные EUR", "Рубли"]);
    expect(s.rows[2]).toMatchObject({ convertedMinor: null, sharePermille: 0 });
  });

  it("splits shares near 1000‰ over positive amounts only", () => {
    const s = summarizeAccounts(
      [...SEED, acc("Долг", "USD", -50000)],
      "USD",
      index,
      TODAY,
    );
    expect(s.totalMinor).toBe(240550 - 50000);
    expect(s.rows.map((r) => [r.name, r.sharePermille])).toEqual([
      ["Карта USD", 516],
      ["Наличные EUR", 284],
      ["Наличные RSD", 201],
      ["Долг", 0],
    ]);
    const sum = s.rows.reduce((t, r) => t + r.sharePermille, 0);
    expect(Math.abs(sum - 1000)).toBeLessThanOrEqual(s.rows.length);
  });

  it("counts a negative account in another currency in the total, not in shares", () => {
    const s = summarizeAccounts(
      [acc("Карта USD", "USD", 124050), acc("Наличные EUR", "EUR", -62000)],
      "USD",
      index,
      TODAY,
    );
    expect(s.totalMinor).toBe(124050 - 68200);
    expect(s.rows.map((r) => [r.name, r.convertedMinor, r.sharePermille])).toEqual([
      ["Карта USD", 124050, 1000],
      ["Наличные EUR", -68200, 0],
    ]);
  });

  it("handles a zero total", () => {
    expect(summarizeAccounts([], "RUB", index, TODAY)).toEqual({
      totalMinor: 0,
      unconverted: 0,
      rows: [],
    });
    const s = summarizeAccounts([acc("Пусто", "USD", 0)], "RUB", index, TODAY);
    expect(s.totalMinor).toBe(0);
    expect(s.rows[0]).toMatchObject({ convertedMinor: 0, sharePermille: 0 });
  });
});
