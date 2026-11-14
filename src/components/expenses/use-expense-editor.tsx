"use client";

import { useState, type ReactNode } from "react";
import type { ExpenseCategory } from "@/repositories/categories";
import type { ExpenseEntry } from "@/lib/expense-entry";
import { ExpenseSheet } from "@/components/expenses/expense-sheet";
import type { ExpenseAccount } from "@/components/expenses/account-chips";

export function useExpenseEditor(
  categories: ExpenseCategory[],
  accounts: ExpenseAccount[],
  {
    accountId,
    isListed,
  }: { accountId?: string; isListed: (expenseId: string) => boolean },
): {
  openEditor: (expense: ExpenseEntry) => void;
  editor: ReactNode;
} {
  const [selected, setSelected] = useState<ExpenseEntry | null>(null);

  const editor =
    selected && isListed(selected.id) ? (
      <ExpenseSheet
        key={selected.id}
        expense={selected}
        categories={categories}
        accounts={accounts}
        displayCurrency={selected.displayCurrency}
        accountId={accountId}
        onClose={() => setSelected(null)}
      />
    ) : null;

  return { openEditor: setSelected, editor };
}
