import { describe, expect, it } from "vitest";
import { expensePatch, type ExpenseFormValues } from "@/lib/expense-form";

const RUB_ACCOUNT = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const RUB_ACCOUNT_2 = "7a2d3b4c-5e6f-4a70-9b8c-0d1e2f3a4b5c";
const BTC_ACCOUNT = "8b3e4c5d-6f70-4b81-8c9d-1e2f3a4b5c6d";
const CATEGORY = "9c4f5d6e-7081-4c92-9dae-2f3a4b5c6d7e";
const CATEGORY_2 = "0d5a6e7f-8192-4da3-8ebf-3a4b5c6d7e8f";

const saved = {
  amountMinor: 50000,
  currency: "RUB",
  accountId: RUB_ACCOUNT,
  categoryId: CATEGORY,
  note: "Обед",
  spentAt: "2026-01-15",
} as const;

const opened: ExpenseFormValues = {
  amount: "500",
  currency: "RUB",
  accountId: RUB_ACCOUNT,
  categoryId: CATEGORY,
  note: "Обед",
  spentAt: "2026-01-15",
};

describe("expensePatch", () => {
  it("is empty when nothing changed", () => {
    expect(expensePatch(opened, saved)).toEqual({});
    expect(expensePatch({ ...opened, amount: "500,00" }, saved)).toEqual({});
  });

  it("holds only the changed note, category or date", () => {
    expect(expensePatch({ ...opened, note: "Ужин" }, saved)).toEqual({ note: "Ужин" });
    expect(expensePatch({ ...opened, categoryId: CATEGORY_2 }, saved)).toEqual({
      categoryId: CATEGORY_2,
    });
    expect(expensePatch({ ...opened, spentAt: "2026-01-14" }, saved)).toEqual({
      spentAt: "2026-01-14",
    });
  });

  it("sends the amount with its currency", () => {
    expect(expensePatch({ ...opened, amount: "700" }, saved)).toEqual({
      amountMinor: 70000,
      currency: "RUB",
    });
  });

  it("sends an account of the same currency alone", () => {
    expect(expensePatch({ ...opened, accountId: RUB_ACCOUNT_2 }, saved)).toEqual({
      accountId: RUB_ACCOUNT_2,
    });
  });

  it("sends an account of another currency with the currency and the amount, even when the typed amount is the same", () => {
    expect(
      expensePatch({ ...opened, accountId: BTC_ACCOUNT, currency: "BTC" }, saved),
    ).toEqual({ amountMinor: 50000000000, currency: "BTC", accountId: BTC_ACCOUNT });
  });
});
