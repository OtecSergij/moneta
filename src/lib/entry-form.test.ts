import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
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
