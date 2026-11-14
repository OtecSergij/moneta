import type { ExpenseWithConversion } from "@/repositories/expenses";

export type ExpenseEntry = Pick<
  ExpenseWithConversion,
  | "id"
  | "categoryId"
  | "accountId"
  | "amountMinor"
  | "currency"
  | "note"
  | "spentAt"
  | "convertedMinor"
  | "displayCurrency"
>;

export function toExpenseEntry(expense: ExpenseWithConversion): ExpenseEntry {
  return {
    id: expense.id,
    categoryId: expense.categoryId,
    accountId: expense.accountId,
    amountMinor: expense.amountMinor,
    currency: expense.currency,
    note: expense.note,
    spentAt: expense.spentAt,
    convertedMinor: expense.convertedMinor,
    displayCurrency: expense.displayCurrency,
  };
}
