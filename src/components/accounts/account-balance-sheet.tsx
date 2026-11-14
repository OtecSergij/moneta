"use client";

import { useState } from "react";
import type { CurrencyCode } from "@/lib/currency";
import { type AccountPatch, balanceEntry } from "@/lib/accounts";
import { fractionDigitsError } from "@/lib/entry-form";
import { minorToInput } from "@/lib/money";
import { useSheetTask } from "@/lib/hooks/use-sheet-task";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Button } from "@/components/kit/button";
import { AmountField } from "@/components/expenses/amount-field";

export function AccountBalanceSheet({
  account,
  onClose,
  onSave,
}: {
  account: { name: string; currency: CurrencyCode; balanceMinor: number };
  onClose: () => void;
  onSave: (patch: AccountPatch) => Promise<boolean>;
}) {
  const [loadedBalanceMinor] = useState(account.balanceMinor);
  const initialBalance = minorToInput(loadedBalanceMinor, account.currency);
  const [balance, setBalance] = useState(initialBalance);
  const [error, setError] = useState<string | undefined>();
  const { pending: saving, run } = useSheetTask(onClose);

  async function save() {
    const entry = balanceEntry(balance, loadedBalanceMinor, account.currency);
    if (entry.kind === "invalid") {
      setError(fractionDigitsError(balance, account.currency) ?? "Введите сумму");
      return;
    }
    setError(undefined);
    if (entry.kind === "unchanged") {
      onClose();
      return;
    }

    await run(() => onSave(entry.patch));
  }

  return (
    <BottomSheet
      onClose={onClose}
      title={account.name}
      busy={saving}
    >
      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <AmountField
          id="account-balance"
          size="sheet"
          label="Остаток"
          currency={account.currency}
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          error={error}
          disabled={saving}
        />
        <Button type="submit" loading={saving}>
          Сохранить
        </Button>
      </form>
    </BottomSheet>
  );
}
