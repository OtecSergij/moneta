import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FUTURE_DATE_ERROR, OLD_DATE_ERROR } from "@/lib/dates";
import {
  entryDateField,
  fractionDigitsError,
  refinePositiveAmount,
  requirePositiveAmount,
} from "@/lib/entry-form";

const MESSAGE = "Введите сумму больше нуля";

describe("fractionDigitsError", () => {
  it("names the currency's limit when a number has more digits after the comma", () => {
    expect(fractionDigitsError("12,345", "EUR")).toBe("Не больше 2 знаков после запятой");
    expect(fractionDigitsError("12.345", "RUB")).toBe("Не больше 2 знаков после запятой");
    expect(fractionDigitsError("1 240,505", "USD")).toBe("Не больше 2 знаков после запятой");
    expect(fractionDigitsError("100,555", "RSD")).toBe("Не больше 2 знаков после запятой");
    expect(fractionDigitsError("0,000000001", "BTC")).toBe("Не больше 8 знаков после запятой");
  });

  it("stays silent for amounts within the limit and for input that is not such a number", () => {
    for (const amount of ["12,34", "12", "", "  ", "abc", "-1,234", "1,2,3"]) {
      expect(fractionDigitsError(amount, "EUR"), amount).toBeUndefined();
    }
    expect(fractionDigitsError("0,00000001", "BTC")).toBeUndefined();
  });
});

describe("requirePositiveAmount", () => {
  const schema = z
    .object({ credit: z.string() })
    .superRefine((v, ctx) => requirePositiveAmount(v.credit, "EUR", ["credit"], ctx));

  it("reports too many digits after the comma at the given path instead of «больше нуля»", () => {
    const res = schema.safeParse({ credit: "12,345" });
    expect(res.error?.issues.map((i) => ({ path: i.path, message: i.message }))).toEqual([
      { path: ["credit"], message: "Не больше 2 знаков после запятой" },
    ]);
  });

  it("requirePositiveAmount reports «Введите сумму больше нуля» at the given path for zero, empty and unparsable input", () => {
    for (const credit of ["0", "0,00", "", "  ", "abc", "-5", "-1,234"]) {
      const res = schema.safeParse({ credit });
      expect(res.success, credit).toBe(false);
      expect(res.error?.issues.map((i) => ({ path: i.path, message: i.message }))).toEqual([
        { path: ["credit"], message: MESSAGE },
      ]);
    }
    expect(schema.safeParse({ credit: "0,01" }).success).toBe(true);
    expect(schema.safeParse({ credit: "92" }).success).toBe(true);
  });
});

describe("refinePositiveAmount", () => {
  const schema = z
    .object({ amount: z.string(), currency: z.literal("RUB") })
    .superRefine(refinePositiveAmount);

  it("refinePositiveAmount still reports at amount", () => {
    const res = schema.safeParse({ amount: "0", currency: "RUB" });
    expect(res.error?.issues.map((i) => ({ path: i.path, message: i.message }))).toEqual([
      { path: ["amount"], message: MESSAGE },
    ]);
    expect(schema.safeParse({ amount: "12,50", currency: "RUB" }).success).toBe(true);
  });
});

describe("entryDateField — from 90 days back up to today", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 14, 12)); // 14 Nov 2026, local
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const LAST_ALLOWED = "2026-08-16"; // today − 90
  const TOO_OLD = "2026-08-15"; // today − 91

  function messages(result: ReturnType<ReturnType<typeof entryDateField>["safeParse"]>) {
    return result.error?.issues.map((i) => i.message);
  }

  it("a new entry takes today − 90 and refuses today − 91", () => {
    expect(entryDateField().safeParse(LAST_ALLOWED).success).toBe(true);
    expect(messages(entryDateField().safeParse(TOO_OLD))).toEqual([OLD_DATE_ERROR]);
  });

  it("a card keeps its old stored date untouched, but a date changed to before the bound is refused", () => {
    const stored = "2026-01-10";
    expect(entryDateField(stored).safeParse(stored).success).toBe(true);
    expect(messages(entryDateField(stored).safeParse(TOO_OLD))).toEqual([OLD_DATE_ERROR]);
    expect(entryDateField(stored).safeParse(LAST_ALLOWED).success).toBe(true);
    expect(entryDateField(stored).safeParse("2026-11-01").success).toBe(true);
  });

  it("a card keeps a stored date that is tomorrow in this browser, but a date changed to the future is refused", () => {
    const stored = "2026-11-15"; // saved by a member already in 15 Nov
    expect(entryDateField(stored).safeParse(stored).success).toBe(true);
    expect(messages(entryDateField(stored).safeParse("2026-11-16"))).toEqual([FUTURE_DATE_ERROR]);
    expect(messages(entryDateField().safeParse(stored))).toEqual([FUTURE_DATE_ERROR]);
  });
});
