"use client";

import { useState, type ReactNode } from "react";
import type { Category } from "@/repositories/categories";
import type { ExpenseWithConversion } from "@/repositories/expenses";
import { ExpenseSheet } from "@/components/expenses/expense-sheet";

export function useExpenseEditor(categories: Category[]): {
  openEditor: (expense: ExpenseWithConversion) => void;
  editor: ReactNode;
} {
  const [selected, setSelected] = useState<ExpenseWithConversion | null>(null);

  const editor = selected ? (
    <ExpenseSheet
      key={selected.id}
      expense={selected}
      categories={categories}
      displayCurrency={selected.displayCurrency}
      onClose={() => setSelected(null)}
    />
  ) : null;

  return { openEditor: setSelected, editor };
}
