import { describe, expect, it } from "vitest";
import {
  AccountInput,
  AccountPatch,
  balanceEntry,
  canDeleteAccount,
} from "@/lib/accounts";

describe("AccountPatch", () => {
  it("rejects balanceMinor without loadedBalanceMinor", () => {
    expect(AccountPatch.safeParse({ balanceMinor: 100 }).success).toBe(false);
    expect(AccountPatch.safeParse({ loadedBalanceMinor: 100 }).success).toBe(false);
  });

  it("accepts a negative loadedBalanceMinor", () => {
    expect(
      AccountPatch.safeParse({ balanceMinor: 0, loadedBalanceMinor: -5000 }).success,
    ).toBe(true);
  });

  it("rejects a negative balanceMinor", () => {
    expect(
      AccountPatch.safeParse({ balanceMinor: -1, loadedBalanceMinor: 0 }).success,
    ).toBe(false);
  });

  it("accepts a name-only patch and trims it", () => {
    expect(AccountPatch.parse({ name: "  Карта  " })).toEqual({ name: "Карта" });
    expect(AccountPatch.safeParse({ name: " " }).success).toBe(false);
  });

  it("accepts a color-only patch with a palette color", () => {
    expect(AccountPatch.parse({ color: "#8B5CF6" })).toEqual({ color: "#8B5CF6" });
    expect(AccountPatch.safeParse({ color: "#123456" }).success).toBe(false);
  });

  it("rejects an empty patch", () => {
    expect(AccountPatch.safeParse({}).success).toBe(false);
  });
});

describe("AccountInput", () => {
  it("requires a known currency, a palette color and a non-negative integer balance", () => {
    const base = { name: "Карта", currency: "USD", color: "#3B82F6", balanceMinor: 0 };
    expect(AccountInput.safeParse(base).success).toBe(true);
    expect(AccountInput.safeParse({ ...base, currency: "GBP" }).success).toBe(false);
    expect(AccountInput.safeParse({ ...base, color: "#123456" }).success).toBe(false);
    expect(AccountInput.safeParse({ ...base, color: undefined }).success).toBe(false);
    expect(AccountInput.safeParse({ ...base, balanceMinor: 1.5 }).success).toBe(false);
    expect(AccountInput.safeParse({ ...base, name: "x".repeat(41) }).success).toBe(false);
  });
});

describe("balanceEntry", () => {
  it("changes nothing when the field is untouched, also with a negative loaded balance", () => {
    expect(balanceEntry("500", 50000, "RUB")).toEqual({ kind: "unchanged" });
    expect(balanceEntry("-50", -5000, "RUB")).toEqual({ kind: "unchanged" });
  });

  it("changes nothing for an untouched prefill with group spaces, also a negative one", () => {
    expect(balanceEntry("12 480,50", 1248050, "RUB")).toEqual({ kind: "unchanged" });
    expect(balanceEntry("-12 480,50", -1248050, "RUB")).toEqual({ kind: "unchanged" });
    expect(balanceEntry("-3 000", -300000, "RSD")).toEqual({ kind: "unchanged" });
  });

  it("rejects an unparsable entry", () => {
    expect(balanceEntry("", 0, "RUB")).toEqual({ kind: "invalid" });
    expect(balanceEntry("12,345", 0, "RUB")).toEqual({ kind: "invalid" });
  });

  it("rejects a negative entry", () => {
    expect(balanceEntry("-20", -5000, "RUB")).toEqual({ kind: "invalid" });
  });

  it("changes nothing when the same number is entered in another format", () => {
    expect(balanceEntry("500,00", 50000, "RUB")).toEqual({ kind: "unchanged" });
  });

  it("returns a patch with the new and the loaded balance for a new number", () => {
    expect(balanceEntry("0", -5000, "RUB")).toEqual({
      kind: "patch",
      patch: { balanceMinor: 0, loadedBalanceMinor: -5000 },
    });
  });
});

describe("canDeleteAccount", () => {
  it("allows deleting only an account without expenses", () => {
    expect(canDeleteAccount({ expenseCount: 0 })).toBe(true);
    expect(canDeleteAccount({ expenseCount: 1 })).toBe(false);
  });
});
