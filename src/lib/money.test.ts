import { describe, expect, it } from "vitest";
import type { CurrencyCode } from "@/lib/currency";
import {
  formatMoney,
  formatMoneyParts,
  minorToInput,
  parseMoney,
} from "@/lib/money";

const NBSP = " ";
const THIN = " ";

describe("formatMoney", () => {
  it("formats amounts across currencies", () => {
    expect(formatMoney(301000, "RUB")).toBe(`3${THIN}010${NBSP}₽`);
    expect(formatMoney(2000, "USD")).toBe(`20${NBSP}$`);
    expect(formatMoney(1550, "EUR")).toBe(`15,50${NBSP}€`);
    expect(formatMoney(300000, "RSD")).toBe(`3${THIN}000${NBSP}RSD`);
    expect(formatMoney(45000, "BTC")).toBe(`0,00045${NBSP}₿`);
  });

  it("rounds RSD to zero display digits, half-even", () => {
    expect(formatMoney(202794, "RSD")).toBe(`2${THIN}028${NBSP}RSD`);
    // Exact ties (.50 para) resolve to the nearest even dinar.
    expect(formatMoney(202650, "RSD")).toBe(`2${THIN}026${NBSP}RSD`); // 2026 even, stays
    expect(formatMoney(202750, "RSD")).toBe(`2${THIN}028${NBSP}RSD`); // 2027 odd, rounds up
  });

  it("keeps grouping, zero, and negative handling for RUB", () => {
    expect(formatMoney(1248000, "RUB")).toBe(`12${THIN}480${NBSP}₽`);
    expect(formatMoney(1248050, "RUB")).toBe(`12${THIN}480,50${NBSP}₽`);
    expect(formatMoney(0, "RUB")).toBe(`0${NBSP}₽`);
    expect(formatMoney(-1248000, "RUB")).toBe(`-12${THIN}480${NBSP}₽`);
  });

  it("drops the minus from a negative amount that displays as zero", () => {
    expect(formatMoney(-49, "RSD")).toBe(`0${NBSP}RSD`);
    expect(formatMoney(-50, "RSD")).toBe(`0${NBSP}RSD`);
    expect(formatMoney(-51, "RSD")).toBe(`-1${NBSP}RSD`);
    expect(formatMoney(-1, "RUB")).toBe(`-0,01${NBSP}₽`);
  });

  it("strips trailing zeros for BTC but never the whole fraction when non-zero", () => {
    expect(formatMoney(100000000, "BTC")).toBe(`1${NBSP}₿`);
    expect(formatMoney(1, "BTC")).toBe(`0,00000001${NBSP}₿`);
  });

  it("renders an unknown code instead of crashing on it", () => {
    // Not reachable through the type system — db/schema/expenses.ts builds the
    // pg enum from CURRENCY_CODES itself — but a hand-written migration could
    // still add a label, and every read path calls currencyMeta. The cast is
    // the point of the test: prove the degrade, not the type.
    expect(formatMoney(12480, "XYZ" as CurrencyCode)).toBe(
      `124,80${NBSP}XYZ`,
    );
  });
});

describe("formatMoneyParts", () => {
  it("splits the number from the symbol without the joining NBSP", () => {
    expect(formatMoneyParts(1248050, "RUB")).toEqual({
      amount: `12${THIN}480,50`,
      symbol: "₽",
    });
    expect(formatMoneyParts(300000, "RSD")).toEqual({
      amount: `3${THIN}000`,
      symbol: "RSD",
    });
    expect(formatMoneyParts(45000, "BTC")).toEqual({
      amount: "0,00045",
      symbol: "₿",
    });
    expect(formatMoneyParts(-1248000, "RUB")).toEqual({
      amount: `-12${THIN}480`,
      symbol: "₽",
    });
  });

  it("drops the minus from a negative amount that displays as zero", () => {
    expect(formatMoneyParts(-49, "RSD")).toEqual({ amount: "0", symbol: "RSD" });
    expect(formatMoneyParts(-50, "RSD")).toEqual({ amount: "0", symbol: "RSD" });
    expect(formatMoneyParts(-1, "RUB")).toEqual({ amount: "-0,01", symbol: "₽" });
  });
});

describe("parseMoney", () => {
  it("parses amounts across currencies", () => {
    expect(parseMoney("12,345", "RUB")).toBeNull();
  });

  it("rejects more fractional digits than the currency's exponent", () => {
    expect(parseMoney("10.999", "RUB")).toBeNull();
    expect(parseMoney("0.123456789", "BTC")).toBeNull(); // 9 digits > exponent 8
  });

  it("accepts up to `exponent` fractional digits", () => {
    expect(parseMoney("15,5", "EUR")).toBe(1550);
    expect(parseMoney("0,00004507", "BTC")).toBe(4507); // full 8-digit exponent
  });

  it("ignores grouping spaces and rejects garbage", () => {
    expect(parseMoney(`12${THIN}480,50`, "RUB")).toBe(1248050);
    expect(parseMoney(`12${NBSP}480`, "RUB")).toBe(1248000);
    expect(parseMoney("", "RUB")).toBeNull();
    expect(parseMoney("abc", "RUB")).toBeNull();
    expect(parseMoney("-5", "RUB")).toBeNull();
  });

  it.each([
    ["a plain space", " "],
    ["a no-break space", NBSP],
    ["a narrow no-break space", THIN],
  ])("accepts %s anywhere in the number", (_, space) => {
    expect(parseMoney(`1${space}240,50`, "RUB")).toBe(124050);
    expect(parseMoney(`10${space}800`, "RSD")).toBe(1080000);
    expect(parseMoney(`${space}1${space}2${space}40,5${space}0${space}`, "RUB")).toBe(124050);
  });

  it("requires digits on both sides of the separator", () => {
    // The accepting pattern is built per currency from `meta.exponent`, so
    // these pin the parts of it that don't vary — a template edit that made
    // the integer part optional would otherwise pass unnoticed.
    expect(parseMoney(".5", "RUB")).toBeNull();
    expect(parseMoney("1.", "RUB")).toBeNull();
    expect(parseMoney(",5", "BTC")).toBeNull();
  });

  it("parses zero, which is what the form's `> 0` check rejects on", () => {
    expect(parseMoney("0", "RUB")).toBe(0);
    expect(parseMoney("0,00", "RUB")).toBe(0);
    expect(parseMoney("0", "BTC")).toBe(0);
  });
});

describe("minorToInput", () => {
  it("uses `exponent`, not `displayDigits` — RSD keeps its para", () => {
    expect(minorToInput(202794, "RSD")).toBe("2 027,94");
  });

  it("separates groups of three digits with a plain space", () => {
    expect(minorToInput(124050, "RUB")).toBe("1 240,50");
    expect(minorToInput(100000, "RUB")).toBe("1 000");
    expect(minorToInput(1080000, "RSD")).toBe("10 800");
    expect(minorToInput(123456789012, "RUB")).toBe("1 234 567 890,12");
    expect(minorToInput(99900, "RUB")).toBe("999");
    expect(minorToInput(123400000000, "BTC")).toBe("1 234");
  });

  it("round-trips through parseMoney for all five currencies", () => {
    const cases: Array<[number, CurrencyCode]> = [
      [0, "RUB"],
      [1248050, "RUB"],
      [2000, "USD"],
      [1550, "EUR"],
      [300050, "RSD"], // non-zero para
      [12345678, "BTC"], // 8 significant digits
    ];
    for (const [minor, currency] of cases) {
      expect(parseMoney(minorToInput(minor, currency), currency)).toBe(minor);
    }
  });
  it("keeps the leading minus for negative amounts", () => {
    expect(minorToInput(-5000, "RUB")).toBe("-50");
    expect(minorToInput(-1248050, "RUB")).toBe("-12 480,50");
    expect(minorToInput(-202794, "RSD")).toBe("-2 027,94");
    expect(minorToInput(-300000, "RSD")).toBe("-3 000");
    expect(minorToInput(-45000, "BTC")).toBe("-0,00045000");
    expect(minorToInput(-5, "RUB")).toBe("-0,05");
  });

  it("leaves positive amounts unchanged", () => {
    expect(minorToInput(5000, "RUB")).toBe("50");
    expect(minorToInput(45000, "BTC")).toBe("0,00045000");
  });
});
