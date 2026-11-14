"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { CurrencyCode } from "@/lib/currency";
import { parseMoney } from "@/lib/money";
import { ACCOUNT_NAME_MAX } from "@/lib/accounts";
import { fractionDigitsError } from "@/lib/entry-form";
import { firstFreeColor } from "@/lib/palette";
import { createAccountAction } from "@/lib/actions/accounts";
import { runAction } from "@/lib/hooks/use-action-runner";
import { useSheetTask } from "@/lib/hooks/use-sheet-task";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Button } from "@/components/kit/button";
import { ColorSwatches } from "@/components/kit/color-swatches";
import { TextField } from "@/components/kit/text-field";
import { CurrencySegment } from "@/components/currency/currency-segment";
import { RoundIconButton } from "@/components/kit/round-icon-button";
import { AmountField } from "@/components/expenses/amount-field";

function AccountNewForm({
  displayCurrency,
  usedColors,
  saving,
  run,
}: {
  displayCurrency: CurrencyCode;
  usedColors: string[];
  saving: boolean;
  run: (task: () => Promise<boolean>) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(() => firstFreeColor(usedColors));
  const [currency, setCurrency] = useState(displayCurrency);
  const [balance, setBalance] = useState("");
  const [errors, setErrors] = useState<{ name?: string; balance?: string }>({});

  async function submit() {
    const trimmed = name.trim();
    const balanceMinor = balance.trim() === "" ? 0 : parseMoney(balance, currency);
    const next = {
      name: trimmed.length === 0 ? "Введите название" : undefined,
      balance:
        balanceMinor === null
          ? (fractionDigitsError(balance, currency) ?? "Введите сумму")
          : undefined,
    };
    setErrors(next);
    if (next.name || balanceMinor === null) return;

    await run(() =>
      runAction(
        () => createAccountAction({ name: trimmed, currency, color, balanceMinor }),
        "Не удалось добавить счёт",
      ),
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <TextField
        label="Название"
        labelHidden
        size="lg"
        placeholder="Например, наличные EUR"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={ACCOUNT_NAME_MAX}
        autoFocus
        error={errors.name}
        disabled={saving}
      />
      <ColorSwatches
        value={color}
        onChange={setColor}
        size="sheet"
        disabled={saving}
      />
      <CurrencySegment
        value={currency}
        onChange={setCurrency}
        label="Валюта"
        disabled={saving}
      />
      <AmountField
        id="account-new-balance"
        size="sheet"
        label="Остаток"
        currency={currency}
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
        error={errors.balance}
        disabled={saving}
      />
      <Button type="submit" loading={saving}>
        Добавить счёт
      </Button>
    </form>
  );
}

export function AccountNewButton({
  displayCurrency,
  usedColors,
}: {
  displayCurrency: CurrencyCode;
  usedColors: string[];
}) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useSheetTask(() => setOpen(false));

  return (
    <>
      <RoundIconButton
        icon={Plus}
        label="Новый счёт"
        onClick={() => setOpen(true)}
      />
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Новый счёт"
        busy={pending}
      >
        <AccountNewForm
          displayCurrency={displayCurrency}
          usedColors={usedColors}
          saving={pending}
          run={run}
        />
      </BottomSheet>
    </>
  );
}
