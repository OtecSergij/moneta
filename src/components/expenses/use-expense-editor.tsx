"use client";

import { useState, type ReactNode } from "react";
import type { Category } from "@/repositories/categories";
import type { Expense } from "@/repositories/expenses";
import { EditExpenseDialog } from "@/components/expenses/edit-expense-dialog";

// Shared "click an expense → edit/delete dialog" wiring for every list that
// shows expenses (home recents, History day list, History category breakdown).
// Returns `openEditor(expense)` to wire to a row's click, and `editor` to render
// once at the end of the list. Replaces three copies of the same state + dialog.
export function useExpenseEditor(categories: Category[]): {
  openEditor: (expense: Expense) => void;
  editor: ReactNode;
} {
  const [selected, setSelected] = useState<Expense | null>(null);

  const editor = selected ? (
    <EditExpenseDialog
      key={selected.id}
      expense={selected}
      categories={categories}
      onClose={() => setSelected(null)}
    />
  ) : null;

  return { openEditor: setSelected, editor };
}
