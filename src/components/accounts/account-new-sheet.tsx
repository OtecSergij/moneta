"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import type { CurrencyCode } from "@/lib/currency";
import { parseMoney } from "@/lib/money";
import { ACCOUNT_NAME_MAX } from "@/lib/accounts";
import { createAccountAction } from "@/lib/actions/accounts";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Button } from "@/components/kit/button";
import { TextField } from "@/components/kit/text-field";
import { CurrencySegment } from "@/components/currency/currency-segment";
import { HeaderAddButton } from "@/components/layout/screen-header";
import { BalanceField } from "@/components/accounts/balance-field";

function AccountNewForm({
  displayCurrency,
  onCreated,
}: {
  displayCurrency: CurrencyCode;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(displayCurrency);
  const [balance, setBalance] = useState("");
  const [errors, setErrors] = useState<{ name?: string; balance?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (saving) return;
    const trimmed = name.trim();
    const balanceMinor = balance.trim() === "" ? 0 : parseMoney(balance, currency);
    const next = {
      name: trimmed.length === 0 ? "Введите название" : undefined,
      balance: balanceMinor === null ? "Введите сумму" : undefined,
    };
    setErrors(next);
    if (next.name || balanceMinor === null) return;

    setSaving(true);
    try {
      const res = await createAccountAction({ name: trimmed, currency, balanceMinor });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onCreated();
    } catch (error) {
      unstable_rethrow(error);
      toast.error("Не удалось добавить счёт");
    } finally {
      setSaving(false);
    }
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
      />
      <CurrencySegment value={currency} onChange={setCurrency} label="Валюта" />
      <BalanceField
        id="account-new-balance"
        currency={currency}
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
        error={errors.balance}
      />
      <Button type="submit" loading={saving}>
        Добавить счёт
      </Button>
    </form>
  );
}

export function AccountNewButton({
  displayCurrency,
}: {
  displayCurrency: CurrencyCode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <HeaderAddButton label="Новый счёт" onClick={() => setOpen(true)} />
      <BottomSheet open={open} onOpenChange={setOpen} title="Новый счёт">
        <AccountNewForm
          displayCurrency={displayCurrency}
          onCreated={() => setOpen(false)}
        />
      </BottomSheet>
    </>
  );
}
