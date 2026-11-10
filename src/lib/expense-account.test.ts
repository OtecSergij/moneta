import { describe, expect, it } from "vitest";
import { defaultAccountSelection, knownAccountId, pickAccountCurrency } from "@/lib/expense-account";

const ACCOUNTS = [
  { id: "usd", currency: "USD" as const },
  { id: "rsd", currency: "RSD" as const },
];

describe("pickAccountCurrency", () => {
  it("takes the chosen account's currency", () => {
    expect(pickAccountCurrency(ACCOUNTS, "rsd", "RUB")).toBe("RSD");
  });

  it("keeps the previous currency for «Без счёта»", () => {
    expect(pickAccountCurrency(ACCOUNTS, null, "USD")).toBe("USD");
  });

  it("falls back for an account that no longer exists", () => {
    expect(pickAccountCurrency(ACCOUNTS, "gone", "EUR")).toBe("EUR");
  });
});

describe("defaultAccountSelection", () => {
  it("selects the author's last account with its currency", () => {
    expect(
      defaultAccountSelection({
        accounts: ACCOUNTS,
        lastAccountId: "rsd",
        lastCurrency: "USD",
        displayCurrency: "RUB",
      }),
    ).toEqual({ accountId: "rsd", currency: "RSD" });
  });

  it("falls back to «Без счёта» and the last currency when the last account was deleted", () => {
    expect(
      defaultAccountSelection({
        accounts: ACCOUNTS,
        lastAccountId: "gone",
        lastCurrency: "EUR",
        displayCurrency: "RUB",
      }),
    ).toEqual({ accountId: null, currency: "EUR" });
  });

  it("uses the display currency when there is no previous expense", () => {
    expect(
      defaultAccountSelection({
        accounts: ACCOUNTS,
        lastAccountId: null,
        lastCurrency: null,
        displayCurrency: "RUB",
      }),
    ).toEqual({ accountId: null, currency: "RUB" });
  });

  it("works with no accounts in the space", () => {
    expect(
      defaultAccountSelection({
        accounts: [],
        lastAccountId: "usd",
        lastCurrency: "USD",
        displayCurrency: "RUB",
      }),
    ).toEqual({ accountId: null, currency: "USD" });
  });
});

describe("knownAccountId", () => {
  it("keeps an account that is still listed", () => {
    expect(knownAccountId(ACCOUNTS, "rsd")).toBe("rsd");
  });

  it("falls back to «Без счёта» for a deleted account or none", () => {
    expect(knownAccountId(ACCOUNTS, "gone")).toBeNull();
    expect(knownAccountId(ACCOUNTS, null)).toBeNull();
    expect(knownAccountId([], "usd")).toBeNull();
  });
});
