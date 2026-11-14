"use client";

import { useState, useTransition } from "react";
import type { ExpenseCategory } from "@/repositories/categories";
import type { CurrencyCode } from "@/lib/currency";
import type { RateSnapshot } from "@/lib/fx/convert";
import { MoreHorizontal } from "lucide-react";
import {
  BackLink,
  DetailHeader,
  DetailTitle,
} from "@/components/kit/detail-header";
import { RoundIconButton } from "@/components/kit/round-icon-button";
import { DisplayCurrencyChip } from "@/components/currency/display-currency-chip";
import { canDeleteAccount, type AccountPatch } from "@/lib/accounts";
import { deleteAccountAction, updateAccountAction } from "@/lib/actions/accounts";
import {
  createTopUpAction,
  deleteTopUpAction,
  updateTopUpAction,
} from "@/lib/actions/top-ups";
import {
  createTransferAction,
  deleteTransferAction,
  updateTransferAction,
} from "@/lib/actions/transfers";
import {
  isListed,
  type AccountDayItem,
  type TopUpWithConversion,
  type TransferWithConversion,
} from "@/lib/account-days";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import type { TopUpPatch } from "@/lib/top-ups";
import {
  transferTargets,
  type TransferAmountPatch,
  type TransferInput,
} from "@/lib/transfers";
import { AccountBalanceCard } from "@/components/accounts/account-balance-card";
import { AccountMenuSheet } from "@/components/accounts/account-menu-sheet";
import { AccountBalanceSheet } from "@/components/accounts/account-balance-sheet";
import { AccountEditSheet } from "@/components/accounts/account-edit-sheet";
import { AccountDayList } from "@/components/accounts/account-day-list";
import type { Day } from "@/components/kit/day-list";
import { TopUpSheet } from "@/components/accounts/top-up-sheet";
import { TransferCardSheet } from "@/components/accounts/transfer-card-sheet";
import { TransferSheet } from "@/components/accounts/transfer-sheet";
import { useExpenseEditor } from "@/components/expenses/use-expense-editor";
import type { ExpenseAccount } from "@/components/expenses/account-chips";

export function AccountScreen({
  account,
  convertedMinor,
  days,
  categories,
  accounts,
  displayCurrency,
  rates,
  today,
}: {
  account: {
    id: string;
    name: string;
    currency: CurrencyCode;
    color: string;
    balanceMinor: number;
    expenseCount: number;
  };
  convertedMinor: number | null;
  days: Day<AccountDayItem>[];
  categories: ExpenseCategory[];
  accounts: ExpenseAccount[];
  displayCurrency: CurrencyCode;
  rates: RateSnapshot;
  today: string;
}) {
  const run = useActionRunner("/accounts");
  const { openEditor, editor } = useExpenseEditor(categories, accounts, {
    accountId: account.id,
    isListed: (id) => isListed(days, "expense", id),
  });
  const [sheet, setSheet] = useState<
    "menu" | "balance" | "edit" | "topUp" | "transfer" | "transferCard" | null
  >(null);
  const [topUp, setTopUp] = useState<TopUpWithConversion | null>(null);
  const [transfer, setTransfer] = useState<TransferWithConversion | null>(null);
  const [deleting, startTransition] = useTransition();
  const close = () => setSheet(null);
  const topUpListed = topUp === null || isListed(days, "topUp", topUp.id);
  const targets = transferTargets(accounts, account.id);

  const save = (patch: AccountPatch) =>
    run(() => updateAccountAction(account.id, patch), "Не удалось сохранить счёт");

  function openTopUp(next: TopUpWithConversion | null) {
    setTopUp(next);
    setSheet("topUp");
  }

  function saveTopUp(fields: TopUpPatch) {
    return run(
      () =>
        topUp
          ? updateTopUpAction(account.id, topUp.id, fields)
          : createTopUpAction({ accountId: account.id, ...fields }),
      "Не удалось сохранить пополнение",
      topUp ? "Пополнение обновлено" : "Счёт пополнен",
    );
  }

  async function removeTopUp() {
    if (!topUp) return false;
    return run(
      () => deleteTopUpAction(account.id, topUp.id),
      "Не удалось удалить пополнение",
      "Пополнение удалено",
    );
  }

  function openTransfer() {
    setSheet("transfer");
  }

  function createTransfer(input: TransferInput) {
    return run(
      () => createTransferAction(input),
      "Не удалось сохранить перевод",
      "Деньги переведены",
    );
  }

  function openTransferCard(next: TransferWithConversion) {
    setTransfer(next);
    setSheet("transferCard");
  }

  async function saveTransfer(patch: TransferAmountPatch) {
    if (!transfer) return false;
    return run(
      () => updateTransferAction(account.id, transfer.id, patch),
      "Не удалось сохранить перевод",
      "Перевод обновлён",
    );
  }

  async function removeTransfer() {
    if (!transfer) return false;
    return run(
      () => deleteTransferAction(account.id, transfer.id),
      "Не удалось удалить перевод",
      "Перевод удалён",
    );
  }

  function remove() {
    startTransition(async () => {
      await run(() => deleteAccountAction(account.id), "Не удалось удалить счёт");
    });
  }

  return (
    <>
      <DetailHeader>
        <BackLink href="/accounts">Счета</BackLink>
        <div className="flex items-center gap-2">
          <DisplayCurrencyChip initialCurrency={displayCurrency} />
          <RoundIconButton
            icon={MoreHorizontal}
            label="Действия со счётом"
            onClick={() => setSheet("menu")}
          />
        </div>
      </DetailHeader>

      <div className="px-5 pt-2">
        <DetailTitle>{account.name}</DetailTitle>
      </div>

      <AccountBalanceCard
        balanceMinor={account.balanceMinor}
        currency={account.currency}
        convertedMinor={convertedMinor}
        displayCurrency={displayCurrency}
      />

      {days.length > 0 ? (
        <AccountDayList
          days={days}
          categories={categories}
          displayCurrency={displayCurrency}
          onSelectExpense={openEditor}
          onSelectTopUp={openTopUp}
          onSelectTransfer={openTransferCard}
        />
      ) : null}
      {editor}

      {sheet === "menu" ? (
        <AccountMenuSheet
          name={account.name}
          canDelete={canDeleteAccount(account)}
          deleting={deleting}
          onClose={close}
          onTopUp={() => openTopUp(null)}
          onTransfer={targets.length > 0 ? openTransfer : undefined}
          onBalance={() => setSheet("balance")}
          onEdit={() => setSheet("edit")}
          onDelete={remove}
        />
      ) : null}
      {sheet === "balance" ? (
        <AccountBalanceSheet account={account} onClose={close} onSave={save} />
      ) : null}
      {sheet === "edit" ? (
        <AccountEditSheet account={account} onClose={close} onSave={save} />
      ) : null}
      {sheet === "topUp" && topUpListed ? (
        <TopUpSheet
          topUp={topUp}
          currency={account.currency}
          displayCurrency={displayCurrency}
          onClose={close}
          onSave={saveTopUp}
          onDelete={removeTopUp}
        />
      ) : null}
      {sheet === "transfer" ? (
        <TransferSheet
          account={account}
          targets={targets}
          rates={rates}
          today={today}
          onClose={close}
          onSave={createTransfer}
        />
      ) : null}
      {sheet === "transferCard" && transfer && isListed(days, "transfer", transfer.id) ? (
        <TransferCardSheet
          transfer={transfer}
          onClose={close}
          onSave={saveTransfer}
          onDelete={removeTransfer}
        />
      ) : null}
    </>
  );
}
