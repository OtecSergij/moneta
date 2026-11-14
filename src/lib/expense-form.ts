import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currency";
import { parseMoney } from "@/lib/money";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";
import { entryDateField, refinePositiveAmount } from "@/lib/entry-form";
import type { ExpenseInput, ExpensePatch } from "@/repositories/expenses";

// Shared schema for the create (home) and edit (history modal) expense forms.
// `amount` is free text parsed to minor units; the rest mirror the repo's
// ExpenseInput. The "not in the future" check here uses the browser's own
// today; the server allows one day of slack (see isAllowedEntryDate in
// src/lib/fx/provider.ts). The edit form passes the expense's saved date
// (see entryDateField).
//
// Amount validation is currency-dependent (BTC parses to 8 fraction digits,
// the rest to 2), so it can't live in a per-field `.refine` — those can't see
// a sibling field — and lives in the object-level `superRefine` below.
export function expenseFormSchema(storedSpentAt?: string) {
  return z
    .object({
      amount: z.string(),
      currency: z.enum(CURRENCY_CODES),
      categoryId: z.uuid("Выберите категорию"),
      note: z
        .string()
        .trim()
        .min(1, "Добавьте описание")
        .max(EXPENSE_NOTE_MAX, `Не больше ${EXPENSE_NOTE_MAX} символов`),
      spentAt: entryDateField(storedSpentAt),
      accountId: z.uuid("Выберите счёт"),
    })
    .superRefine(refinePositiveAmount);
}
export type ExpenseFormValues = z.infer<ReturnType<typeof expenseFormSchema>>;

// Build the action/repo input from validated form values (amounts are
// guaranteed parseable by the schema's superRefine).
export function toExpenseInput(values: ExpenseFormValues): ExpenseInput {
  return {
    categoryId: values.categoryId,
    amountMinor: parseMoney(values.amount, values.currency)!,
    currency: values.currency,
    note: values.note,
    spentAt: values.spentAt,
    accountId: values.accountId,
  };
}

// Only the fields that differ from `saved`, so a save keeps another member's
// edit of the rest. The amount goes with its currency, and a new currency with
// its account.
export function expensePatch(
  values: ExpenseFormValues,
  saved: ExpenseInput,
): ExpensePatch {
  const input = toExpenseInput(values);
  const currencyChanged = input.currency !== saved.currency;
  const patch: ExpensePatch = {};
  if (currencyChanged || input.amountMinor !== saved.amountMinor) {
    patch.amountMinor = input.amountMinor;
    patch.currency = input.currency;
  }
  if (currencyChanged || input.accountId !== saved.accountId) patch.accountId = input.accountId;
  if (input.categoryId !== saved.categoryId) patch.categoryId = input.categoryId;
  if (input.note !== saved.note) patch.note = input.note;
  if (input.spentAt !== saved.spentAt) patch.spentAt = input.spentAt;
  return patch;
}
