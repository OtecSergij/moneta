import { describe, expect, it } from "vitest";
import { AccountInput, AccountPatch } from "@/lib/accounts";

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
