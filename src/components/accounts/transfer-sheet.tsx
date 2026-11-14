"use client";

import { useMemo, useState } from "react";
import type { CurrencyCode } from "@/lib/currency";
import { snapshotIndex, type RateSnapshot } from "@/lib/fx/convert";
import {
  EMPTY_TRANSFER_DRAFT,
  crossCurrency,
  pickTarget,
  transferFormErrors,
  transferFormValues,
  transferInput,
  typeCredit,
  type TransferInput,
} from "@/lib/transfers";
import { useSheetTask } from "@/lib/hooks/use-sheet-task";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Button } from "@/components/kit/button";
import { AccountChips, type ExpenseAccount } from "@/components/expenses/account-chips";
import { AmountField } from "@/components/expenses/amount-field";

export function TransferSheet({
  account,
  targets,
  rates,
  today,
  onClose,
  onSave,
}: {
  account: { id: string; currency: CurrencyCode };
  targets: ExpenseAccount[];
  rates: RateSnapshot;
  today: string;
  onClose: () => void;
  onSave: (input: TransferInput) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(EMPTY_TRANSFER_DRAFT);
  const [submitted, setSubmitted] = useState(false);
  const { pending: saving, run } = useSheetTask(onClose);
  const index = useMemo(() => snapshotIndex(rates, today), [rates, today]);
  const values = transferFormValues(draft, account.currency, targets, index, today);
  const errors = transferFormErrors(values, draft);
  const shown = submitted ? errors : {};
  const creditCurrency = crossCurrency(values);

  async function submit() {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    await run(() => onSave(transferInput(values, account.id)));
  }

  return (
    <BottomSheet
      variant="compact"
      onClose={onClose}
      title="Перевод"
      busy={saving}
    >
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <AccountChips
          accounts={targets}
          value={values.toAccountId}
          onChange={(id) => setDraft((d) => pickTarget(d, id))}
          legend="Куда перевести"
          label="Куда"
          error={shown.toAccountId}
          disabled={saving}
        />
        <AmountField
          id="transfer-out"
          size="sheet"
          label="Списать"
          currency={account.currency}
          value={values.amount}
          onChange={(e) => {
            const amount = e.target.value;
            setDraft((d) => ({ ...d, amount }));
          }}
          error={shown.amount}
          autoFocus
          disabled={saving}
        />
        {creditCurrency ? (
          <AmountField
            id="transfer-in"
            size="sheet"
            label="Зачислить"
            currency={creditCurrency}
            value={values.credit}
            onChange={(e) => {
              const text = e.target.value;
              setDraft((d) => typeCredit(d, text));
            }}
            error={shown.credit}
            disabled={saving}
          />
        ) : null}
        <Button type="submit" className="mt-1" loading={saving}>
          Перевести
        </Button>
      </form>
    </BottomSheet>
  );
}
