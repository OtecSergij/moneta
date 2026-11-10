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

  it("rejects an empty patch", () => {
    expect(AccountPatch.safeParse({}).success).toBe(false);
  });
});

describe("AccountInput", () => {
  it("requires a known currency and a non-negative integer balance", () => {
    const base = { name: "Карта", currency: "USD", balanceMinor: 0 };
    expect(AccountInput.safeParse(base).success).toBe(true);
    expect(AccountInput.safeParse({ ...base, currency: "GBP" }).success).toBe(false);
    expect(AccountInput.safeParse({ ...base, balanceMinor: 1.5 }).success).toBe(false);
    expect(AccountInput.safeParse({ ...base, name: "x".repeat(41) }).success).toBe(false);
  });
});
