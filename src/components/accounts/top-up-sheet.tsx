"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { CurrencyCode } from "@/lib/currency";
import { todayISO } from "@/lib/dates";
import { minorToInput, parseMoney } from "@/lib/money";
import {
  TOP_UP_NOTE_MAX,
  topUpFormSchema,
  topUpNoteToInput,
  topUpPatch,
  type TopUpFormValues,
  type TopUpPatch,
} from "@/lib/top-ups";
import { useConversionPreview } from "@/lib/hooks/use-conversion-preview";
import { useSheetTask } from "@/lib/hooks/use-sheet-task";
import type { TopUpWithConversion } from "@/lib/account-days";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Button } from "@/components/kit/button";
import { SheetEditActions } from "@/components/kit/sheet-edit-actions";
import { TextField } from "@/components/kit/text-field";
import { AmountField } from "@/components/expenses/amount-field";
import { DateChips } from "@/components/expenses/date-chips";

export function TopUpSheet({
  topUp,
  currency,
  displayCurrency,
  onClose,
  onSave,
  onDelete,
}: {
  topUp: TopUpWithConversion | null;
  currency: CurrencyCode;
  displayCurrency: CurrencyCode;
  onClose: () => void;
  onSave: (fields: TopUpPatch) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const { pending: saving, run: runSave } = useSheetTask(onClose);
  const { pending: deleting, run: runDelete } = useSheetTask(onClose);
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<TopUpFormValues>({
    resolver: zodResolver(topUpFormSchema(topUp?.occurredOn)),
    defaultValues: {
      amount: topUp ? minorToInput(topUp.amountMinor, currency) : "",
      currency,
      note: topUp ? topUpNoteToInput(topUp.note) : "",
      occurredOn: topUp?.occurredOn ?? todayISO(),
    },
  });

  const busy = saving || deleting;
  const amount = useWatch({ control, name: "amount" });
  const occurredOn = useWatch({ control, name: "occurredOn" });
  const preview = useConversionPreview({
    amountMinor: parseMoney(amount, currency),
    currency,
    displayCurrency,
    date: occurredOn,
  });

  function onSubmit(values: TopUpFormValues) {
    const patch = topUpPatch(values, topUp);
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    return runSave(() => onSave(patch));
  }

  return (
    <BottomSheet
      variant="compact"
      onClose={onClose}
      title="Пополнение"
      focusSheet={topUp !== null}
      busy={busy}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <AmountField
          id="topup-amount"
          size="sheet"
          currency={currency}
          preview={preview}
          error={errors.amount?.message}
          {...register("amount")}
          disabled={busy}
        />
        <TextField
          id="topup-note"
          label="Описание"
          placeholder={topUp ? undefined : "Например, зарплата"}
          maxLength={TOP_UP_NOTE_MAX}
          {...register("note")}
          disabled={busy}
        />
        <DateChips
          value={occurredOn}
          onChange={(iso) => setValue("occurredOn", iso, { shouldValidate: true })}
          error={errors.occurredOn?.message}
          disabled={busy}
        />
        {topUp ? (
          <SheetEditActions
            deleteLabel="Удалить пополнение"
            onDelete={() => runDelete(onDelete)}
            deleting={deleting}
            saving={saving}
          />
        ) : (
          <Button type="submit" className="mt-1" loading={saving}>
            Пополнить
          </Button>
        )}
      </form>
    </BottomSheet>
  );
}
