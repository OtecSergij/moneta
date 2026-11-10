"use client";

import { useState, type ReactNode } from "react";
import type { Category } from "@/repositories/categories";
import type { ExpenseWithConversion } from "@/repositories/expenses";
import { ExpenseSheet } from "@/components/expenses/expense-sheet";
import type { ExpenseAccount } from "@/components/expenses/account-chips";

export function useExpenseEditor(
  categories: Category[],
  accounts: ExpenseAccount[],
): {
  openEditor: (expense: ExpenseWithConversion) => void;
  editor: ReactNode;
} {
  const [selected, setSelected] = useState<ExpenseWithConversion | null>(null);

  const editor = selected ? (
    <ExpenseSheet
      key={selected.id}
      expense={selected}
      categories={categories}
      accounts={accounts}
      displayCurrency={selected.displayCurrency}
      onClose={() => setSelected(null)}
    />
  ) : null;

  return { openEditor: setSelected, editor };
}
