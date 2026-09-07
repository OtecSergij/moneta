import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currency";
import { parseMoney } from "@/lib/money";
import { isFutureISO } from "@/lib/dates";
import { EXPENSE_NOTE_MAX } from "@/lib/expense-constants";
import type { ExpenseInput } from "@/repositories/expenses";

// Shared schema for the create (home) and edit (history modal) expense forms.
// `amount`/`chargedAmount` are free text parsed to minor units; the rest
// mirror the repo's ExpenseInput. UI-only "not in the future" check (server
// doesn't know the user's timezone — see db/schema/expenses.ts).
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
    // Manual "what did the bank actually charge" fixation — both optional and
    // only meaningful together; toExpenseInput below turns an absent pair
    // into explicit `null`s rather than leaving them `undefined` (AC-30).
    chargedAmount: z.string().optional(),
    chargedCurrency: z.enum(CURRENCY_CODES).optional(),
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

    // Empty means "no fixation" — only validated once the user actually
    // types something into it.
    if (values.chargedAmount) {
      if (!values.chargedCurrency) {
        // An entered charge with no currency is not "no fixation": it is a
        // fixation whose currency ChargedAmountField cleared because the entry
        // currency moved onto it. toExpenseInput would drop the half-pair and
        // save the row without the charge, so the save is blocked until the
        // user names the card themselves (see charged-amount-field.tsx).
        ctx.addIssue({
          code: "custom",
          message: "Выберите валюту списания",
          path: ["chargedCurrency"],
        });
      } else {
        const chargedMinor = parseMoney(
          values.chargedAmount,
          values.chargedCurrency,
        );
        if (chargedMinor === null || chargedMinor <= 0) {
          ctx.addIssue({
            code: "custom",
            message: "Введите сумму больше нуля",
            path: ["chargedAmount"],
          });
        }
      }
    }

    // Mirrors the DB's expenses_charged_currency_differs CHECK
    // (db/schema/expenses.ts) — a field-level message here instead of
    // letting the same rule reject the save with a generic error. Only when
    // an amount is present: a lone charged currency never reaches the DB
    // (toExpenseInput below drops the half-pair), and QuickAddForm keeps one
    // across submits, so without this guard switching the entry currency to
    // match it would block the save through a field the closed fixation panel
    // isn't rendering.
    if (values.chargedAmount && values.chargedCurrency === values.currency) {
      ctx.addIssue({
        code: "custom",
        message: "Валюта списания должна отличаться от валюты траты",
        path: ["chargedCurrency"],
      });
    }
  });
export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

// Build the action/repo input from validated form values (amounts are
// guaranteed parseable by the schema's superRefine).
export function toExpenseInput(values: ExpenseFormValues): ExpenseInput {
  const hasCharged = !!values.chargedAmount && !!values.chargedCurrency;
  return {
    categoryId: values.categoryId,
    amountMinor: parseMoney(values.amount, values.currency)!,
    currency: values.currency,
    // Explicit `null`s when the fixation is absent, not `undefined` —
    // drizzle's `.set(patch)` strips `undefined` keys, which would leave a
    // previously-saved fixation in place instead of clearing it (AC-30).
    chargedAmountMinor: hasCharged
      ? parseMoney(values.chargedAmount!, values.chargedCurrency!)
      : null,
    chargedCurrency: hasCharged ? values.chargedCurrency! : null,
    note: values.note,
    spentAt: values.spentAt,
  };
}
