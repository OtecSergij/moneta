import { describe, expect, it } from "vitest";
import { defaultAccountSelection } from "@/lib/expense-account";

const ACCOUNTS = [
  { id: "usd", currency: "USD" as const },
  { id: "rsd", currency: "RSD" as const },
];

describe("defaultAccountSelection", () => {
  it("selects the author's last account with its currency", () => {
    expect(defaultAccountSelection(ACCOUNTS, "rsd")).toEqual({
      accountId: "rsd",
      currency: "RSD",
    });
  });

  it("falls back to the first account when the last one was deleted", () => {
    expect(defaultAccountSelection(ACCOUNTS, "gone")).toEqual({
      accountId: "usd",
      currency: "USD",
    });
  });

  it("falls back to the first account when there is no previous expense", () => {
    expect(defaultAccountSelection(ACCOUNTS, null)).toEqual({
      accountId: "usd",
      currency: "USD",
    });
  });

  it("returns null when the space has no accounts", () => {
    expect(defaultAccountSelection([], "usd")).toBeNull();
  });
});
