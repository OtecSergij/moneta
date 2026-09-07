"use client";

import { useEffect, useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { X } from "lucide-react";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import type { ExpenseFormValues } from "@/lib/expense-form";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { CurrencySegment } from "@/components/ui/currency-segment";

// Manual "what did the bank actually charge" fixation (plan Step 6.5,
// AC-6/AC-27/AC-30). Rendered by ExpenseFormFields once the user taps the
// status slot under the amount. The entry's own currency is excluded from the
// segment: `expenses_charged_currency_differs` rejects it at the DB, and a
// fixation in the entry's own currency is meaningless anyway.
export function ChargedAmountField({
  entryCurrency,
  lastChargedCurrency,
  displayCurrency,
  onRemove,
}: {
  entryCurrency: CurrencyCode;
  lastChargedCurrency: CurrencyCode | null;
  displayCurrency: CurrencyCode;
  onRemove: () => void;
}) {
  const {
    register,
    control,
    setValue,
    formState: { errors },
  } = useFormContext<ExpenseFormValues>();

  const chargedAmount = useWatch({ control, name: "chargedAmount" });
  const chargedCurrency = useWatch({ control, name: "chargedCurrency" });

  const options = useMemo(
    () => CURRENCY_CODES.filter((c) => c !== entryCurrency),
    [entryCurrency],
  );

  // Last charged currency first: the fixation records what one physical card
  // was debited, so the previous answer predicts the next one far better than
  // the display currency, which is only a view setting. Whatever wins must
  // never equal the entry currency (expenses_charged_currency_differs).
  const defaultCurrency =
    lastChargedCurrency && options.includes(lastChargedCurrency)
      ? lastChargedCurrency
      : options.includes(displayCurrency)
        ? displayCurrency
        : options[0];

  // Seeds a default only on a fresh open — nothing entered on either side, so
  // a guess costs the user nothing. Once an amount is typed, the currency says
  // which card was debited, and re-picking one for them would silently re-label
  // a real charge (entry currency switched to the charged one: «списали 2850
  // RUB» became «списали 2850 USD», within the plausible band, saved without a
  // word). So a collision clears the field instead and expenseFormSchema's
  // «Выберите валюту списания» blocks the save until the user answers.
  useEffect(() => {
    if (chargedCurrency === undefined) {
      if (!chargedAmount) {
        setValue("chargedCurrency", defaultCurrency, { shouldValidate: true });
      }
      return;
    }
    if (!options.includes(chargedCurrency)) {
      setValue("chargedCurrency", undefined, { shouldValidate: true });
    }
  }, [chargedAmount, chargedCurrency, options, defaultCurrency, setValue]);

  function handleRemove() {
    // Cleared to `undefined` here; toExpenseInput (@/lib/expense-form) turns
    // an absent charged pair into explicit `null`s before it reaches the
    // repo — drizzle's `.set(patch)` silently drops `undefined` keys, which
    // would leave a stale fixation in place instead of clearing it (AC-30).
    setValue("chargedAmount", undefined, { shouldValidate: true });
    setValue("chargedCurrency", undefined, { shouldValidate: true });
    onRemove();
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text">
          Сколько списали по факту
        </span>
        <button
          type="button"
          onClick={handleRemove}
          aria-label="Убрать сумму списания"
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:bg-border/60 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        >
          <X className="size-4" />
        </button>
      </div>

      <Field
        label="Сумма списания"
        htmlFor="chargedAmount"
        error={errors.chargedAmount?.message}
      >
        <TextInput
          id="chargedAmount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          className="tabular-nums"
          aria-invalid={!!errors.chargedAmount}
          {...register("chargedAmount")}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <CurrencySegment
          value={chargedCurrency}
          onChange={(c) =>
            setValue("chargedCurrency", c, { shouldValidate: true })
          }
          options={options}
          label="Валюта списания"
        />
        {/* CurrencySegment carries its own aria-label, so Field would render a
            second one — the error line is inlined here instead. */}
        {errors.chargedCurrency?.message ? (
          <p className="text-sm text-danger" role="alert">
            {errors.chargedCurrency.message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
