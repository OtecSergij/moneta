"use client";

import { useState } from "react";
import { unstable_rethrow } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { minorToInput, parseMoney } from "@/lib/money";
import { EXPENSE_FORMS, formatCount, plural, type PluralForms } from "@/lib/plural";
import { ACCOUNT_NAME_MAX, type AccountPatch } from "@/lib/accounts";
import type { AccountSummaryRow } from "@/lib/accounts-total";
import {
  deleteAccountAction,
  updateAccountAction,
} from "@/lib/actions/accounts";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import { Button } from "@/components/kit/button";
import { TextField } from "@/components/kit/text-field";
import { BalanceField } from "@/components/accounts/balance-field";

const DELETE_VERB_FORMS: PluralForms = ["удалится", "удалятся", "удалятся"];

const CONFIRM_BUTTON =
  "h-12 cursor-pointer rounded-control text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60";

export function AccountSheet({
  account,
  onClose,
}: {
  account: AccountSummaryRow;
  onClose: () => void;
}) {
  const [loadedBalanceMinor] = useState(account.balanceMinor);
  const initialBalance = minorToInput(loadedBalanceMinor, account.currency);
  const [name, setName] = useState(account.name);
  const [balance, setBalance] = useState(initialBalance);
  const [errors, setErrors] = useState<{ name?: string; balance?: string }>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  async function save() {
    if (busy) return;
    const trimmed = name.trim();
    const balanceChanged = balance !== initialBalance;
    const balanceMinor = balanceChanged ? parseMoney(balance, account.currency) : null;
    const next = {
      name: trimmed.length === 0 ? "Введите название" : undefined,
      balance: balanceChanged && balanceMinor === null ? "Введите сумму" : undefined,
    };
    setErrors(next);
    if (next.name || next.balance) return;

    const patch: AccountPatch = {};
    if (trimmed !== account.name) patch.name = trimmed;
    if (balanceMinor !== null) {
      patch.balanceMinor = balanceMinor;
      patch.loadedBalanceMinor = loadedBalanceMinor;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setBusy("save");
    try {
      const res = await updateAccountAction(account.id, patch);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onClose();
    } catch (error) {
      unstable_rethrow(error);
      toast.error("Не удалось сохранить счёт");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy("delete");
    try {
      const res = await deleteAccountAction(account.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onClose();
    } catch (error) {
      unstable_rethrow(error);
      toast.error("Не удалось удалить счёт");
    } finally {
      setBusy(null);
    }
  }

  return (
    <BottomSheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      ariaLabel="Счёт"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).focus();
      }}
    >
      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField
          label="Название счёта"
          labelHidden
          variant="title"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={ACCOUNT_NAME_MAX}
          error={errors.name}
        />
        <BalanceField
          id="account-edit-balance"
          currency={account.currency}
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          error={errors.balance}
        />
        {confirming ? (
          <div className="flex flex-col gap-3.5 rounded-panel bg-danger-soft p-4 text-danger-deep">
            <div className="flex flex-col gap-1">
              <span className="text-base font-semibold">
                Удалить «{account.name}»?
              </span>
              <span className="text-sm/5">
                {account.expenseCount > 0
                  ? `Вместе со счётом ${plural(account.expenseCount, DELETE_VERB_FORMS)} ${formatCount(account.expenseCount, EXPENSE_FORMS)}. `
                  : null}
                Отменить это нельзя.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`${CONFIRM_BUTTON} bg-card text-ink`}
                disabled={busy !== null}
                onClick={() => setConfirming(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className={`${CONFIRM_BUTTON} bg-error text-white`}
                disabled={busy !== null}
                aria-busy={busy === "delete" || undefined}
                onClick={() => void remove()}
              >
                Удалить
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button type="submit" loading={busy === "save"}>
              Сохранить
            </Button>
            <Button
              variant="danger-text"
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="size-[18px]" strokeWidth={1.75} aria-hidden />
              Удалить счёт
            </Button>
          </div>
        )}
      </form>
    </BottomSheet>
  );
}
