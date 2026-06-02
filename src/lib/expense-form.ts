import { z } from "zod";
import { parseMoney } from "@/lib/money";
import { isFutureISO } from "@/lib/dates";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";
import type { ExpenseInput } from "@/repositories/expenses";

// Shared schema for the create (home) and edit (history modal) expense forms.
// `amount` is free text parsed to minor units; the rest mirror the repo's
// ExpenseInput. UI-only "not in the future" check (server doesn't know the
// user's timezone — see db/schema/expenses.ts).
export const expenseFormSchema = z.object({
  amount: z.string().refine((s) => {
    const minor = parseMoney(s);
    return minor !== null && minor > 0;
  }, "Введите сумму больше нуля"),
  categoryId: z.uuid("Выберите категорию"),
  note: z
    .string()
    .trim()
    .min(1, "Добавьте описание")
    .max(EXPENSE_NOTE_MAX, `Не больше ${EXPENSE_NOTE_MAX} символов`),
  spentAt: z
    .iso
    .date("Укажите дату")
    .refine((d) => !isFutureISO(d), "Дата не может быть в будущем"),
});
export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

// Build the action/repo input from validated form values (amount is guaranteed
// parseable by the schema's refine).
export function toExpenseInput(values: ExpenseFormValues): ExpenseInput {
  return {
    categoryId: values.categoryId,
    amountMinor: parseMoney(values.amount)!,
    currency: "RUB",
    note: values.note,
    spentAt: values.spentAt,
  };
}
