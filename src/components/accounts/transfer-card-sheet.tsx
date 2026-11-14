"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { TransferWithConversion } from "@/lib/account-days";
import { minorToInput } from "@/lib/money";
import {
  transferAmountPatch,
  transferCardSchema,
  transferLabels,
  type TransferAmountPatch,
  type TransferCardValues,
} from "@/lib/transfers";
import { useSheetTask } from "@/lib/hooks/use-sheet-task";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { SheetEditActions } from "@/components/kit/sheet-edit-actions";
import { AmountField } from "@/components/expenses/amount-field";

export function TransferCardSheet({
  transfer,
  onClose,
  onSave,
  onDelete,
}: {
  transfer: TransferWithConversion;
  onClose: () => void;
  onSave: (patch: TransferAmountPatch) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}) {
  const { pending: saving, run: runSave } = useSheetTask(onClose);
  const { pending: deleting, run: runDelete } = useSheetTask(onClose);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TransferCardValues>({
    resolver: zodResolver(transferCardSchema),
    defaultValues: {
      amount: minorToInput(transfer.amountMinor, transfer.currency),
      currency: transfer.currency,
    },
  });

  function onSubmit(values: TransferCardValues) {
    const patch = transferAmountPatch(values, transfer.amountMinor);
    if (patch === null) {
      onClose();
      return;
    }
    return runSave(() => onSave(patch));
  }

  return (
    <BottomSheet
      variant="compact"
      onClose={onClose}
      title={transferLabels(transfer.side, transfer.otherAccountName).cardTitle}
      focusSheet
      busy={saving || deleting}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
        noValidate
      >
        <AmountField
          id="transfer-card-amount"
          size="sheet"
          currency={transfer.currency}
          error={errors.amount?.message}
          {...register("amount")}
          disabled={saving || deleting}
        />
        <SheetEditActions
          deleteLabel="Удалить перевод"
          onDelete={() => runDelete(onDelete)}
          deleting={deleting}
          saving={saving}
        />
      </form>
    </BottomSheet>
  );
}
