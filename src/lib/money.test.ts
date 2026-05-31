import { describe, expect, it } from "vitest";
import { formatMoney, minorToInput, parseMoney } from "@/lib/money";

const NBSP = " ";
const THIN = " ";

describe("formatMoney", () => {
  it("formats whole rubles without decimals and thin-space grouping", () => {
    expect(formatMoney(1248000)).toBe(`₽${NBSP}12${THIN}480`);
  });

  it("formats kopecks with a comma and two digits", () => {
    expect(formatMoney(1248050)).toBe(`₽${NBSP}12${THIN}480,50`);
  });

  it("pads a single kopeck digit", () => {
    expect(formatMoney(1248005)).toBe(`₽${NBSP}12${THIN}480,05`);
  });

  it("handles sub-ruble amounts", () => {
    expect(formatMoney(99)).toBe(`₽${NBSP}0,99`);
    expect(formatMoney(50)).toBe(`₽${NBSP}0,50`);
  });

  it("handles zero", () => {
    expect(formatMoney(0)).toBe(`₽${NBSP}0`);
  });

  it("groups millions", () => {
    expect(formatMoney(123456789)).toBe(`₽${NBSP}1${THIN}234${THIN}567,89`);
  });

  it("prefixes a minus for negatives", () => {
    expect(formatMoney(-1248000)).toBe(`-₽${NBSP}12${THIN}480`);
  });

  it("falls back to the currency code for unknown currencies", () => {
    expect(formatMoney(100, { currency: "USD" })).toBe(`USD${NBSP}1`);
  });
});

describe("parseMoney", () => {
  it("parses plain integers as rubles", () => {
    expect(parseMoney("12480")).toBe(1248000);
  });

  it("parses a dot decimal", () => {
    expect(parseMoney("1234.5")).toBe(123450);
    expect(parseMoney("1234.56")).toBe(123456);
  });

  it("parses a comma decimal", () => {
    expect(parseMoney("1234,56")).toBe(123456);
  });

  it("ignores grouping spaces (regular, NBSP, thin)", () => {
    expect(parseMoney(`12${THIN}480,50`)).toBe(1248050);
    expect(parseMoney(`12${NBSP}480`)).toBe(1248000);
    expect(parseMoney("12 480")).toBe(1248000);
  });

  it("parses zero", () => {
    expect(parseMoney("0")).toBe(0);
    expect(parseMoney("0,00")).toBe(0);
  });

  it("rejects more than two fractional digits", () => {
    expect(parseMoney("10.999")).toBeNull();
  });

  it("rejects garbage and empty input", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney(".5")).toBeNull();
    expect(parseMoney("1.")).toBeNull();
    expect(parseMoney("-5")).toBeNull();
  });
});

describe("minorToInput", () => {
  it("drops decimals when there are no kopecks", () => {
    expect(minorToInput(1248000)).toBe("12480");
  });

  it("keeps two decimals when there are kopecks", () => {
    expect(minorToInput(1248050)).toBe("12480.50");
    expect(minorToInput(1248005)).toBe("12480.05");
  });

  it("round-trips through parseMoney", () => {
    for (const minor of [0, 99, 100, 123450, 123456, 1248000]) {
      expect(parseMoney(minorToInput(minor))).toBe(minor);
    }
  });
});
