"use client";

import type { ExpenseCategory } from "@/repositories/categories";
import type { ExpenseEntry } from "@/lib/expense-entry";
import type { CurrencyCode } from "@/lib/currency";
import type {
  AccountDayItem,
  TopUpWithConversion,
  TransferWithConversion,
} from "@/lib/account-days";
import { useCategoryById } from "@/lib/hooks/use-category-by-id";
import { DayList, type Day } from "@/components/kit/day-list";
import { ExpenseListRow } from "@/components/expenses/expense-list-row";
import { TopUpRow } from "@/components/accounts/top-up-row";
import { TransferRow } from "@/components/accounts/transfer-row";

export function AccountDayList({
  days,
  categories,
  displayCurrency,
  onSelectExpense,
  onSelectTopUp,
  onSelectTransfer,
}: {
  days: Day<AccountDayItem>[];
  categories: ExpenseCategory[];
  displayCurrency: CurrencyCode;
  onSelectExpense: (expense: ExpenseEntry) => void;
  onSelectTopUp: (topUp: TopUpWithConversion) => void;
  onSelectTransfer: (transfer: TransferWithConversion) => void;
}) {
  const categoryById = useCategoryById(categories);

  return (
    <DayList days={days} displayCurrency={displayCurrency}>
      {(item) => {
        switch (item.kind) {
          case "topUp":
            return (
              <TopUpRow
                key={item.topUp.id}
                topUp={item.topUp}
                onClick={onSelectTopUp}
              />
            );
          case "transfer":
            return (
              <TransferRow
                key={item.transfer.id}
                transfer={item.transfer}
                onClick={onSelectTransfer}
              />
            );
          case "expense":
            return (
              <ExpenseListRow
                key={item.expense.id}
                expense={item.expense}
                category={categoryById.get(item.expense.categoryId)}
                onClick={onSelectExpense}
              />
            );
        }
      }}
    </DayList>
  );
}
