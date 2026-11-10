import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currency";
import { parseMoney } from "@/lib/money";
import { isFutureISO } from "@/lib/dates";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";
import type { ExpenseInput } from "@/repositories/expenses";

// Shared schema for the create (home) and edit (history modal) expense forms.
// `amount` is free text parsed to minor units; the rest mirror the repo's
// ExpenseInput. The "not in the future" check here uses the browser's own
// today; the server allows one day of slack (see spentAtIsValid in
// src/repositories/expenses.ts).
//
// Amount validation is currency-dependent (BTC parses to 8 fraction digits,
// the rest to 2), so it can't live in a per-field `.refine` — those can't see
// a sibling field — and lives in the object-level `superRefine` below.
export const expenseFormSchema = z
  .object({
    amount: z.string(),
    currency: z.enum(CURRENCY_CODES),
    categoryId: z.uuid("Выберите категорию"),
    note: z
      .string()
      .trim()
      .min(1, "Добавьте описание")
      .max(EXPENSE_NOTE_MAX, `Не больше ${EXPENSE_NOTE_MAX} символов`),
    spentAt: z.iso
      .date("Укажите дату")
      .refine((d) => !isFutureISO(d), "Дата не может быть в будущем"),
    accountId: z.uuid("Выберите счёт"),
  })
  .superRefine((values, ctx) => {
    const minor = parseMoney(values.amount, values.currency);
    if (minor === null || minor <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Введите сумму больше нуля",
        path: ["amount"],
      });
    }
  });
export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

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
