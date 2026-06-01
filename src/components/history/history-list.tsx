"use client";

import { useMemo } from "react";
import type { Category } from "@/repositories/categories";
import type { Expense } from "@/repositories/expenses";
import { Money } from "@/components/ui/money";
import { ExpenseListRow } from "@/components/expenses/expense-list-row";
import { useExpenseEditor } from "@/components/expenses/use-expense-editor";

export interface DayGroup {
  day: string;
  heading: string;
  totalMinor: number;
  items: Expense[];
}

export function HistoryList({
  groups,
  categories,
}: {
  groups: DayGroup[];
  categories: Category[];
}) {
  const { openEditor, editor } = useExpenseEditor(categories);
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.day}>
          <div className="mb-1 flex items-center justify-between gap-2 px-2">
            <h3 className="text-sm font-medium text-text-muted">
              {group.heading}
            </h3>
            <Money minor={group.totalMinor} className="text-sm text-text" />
          </div>
          <ul className="flex flex-col gap-1">
            {group.items.map((expense, i) => {
              const category = categoryById.get(expense.categoryId);
              if (!category) return null;
              return (
                <ExpenseListRow
                  key={expense.id}
                  expense={expense}
                  category={category}
                  index={i}
                  subtitle={expense.note}
                  onClick={openEditor}
                />
              );
            })}
          </ul>
        </div>
      ))}
      {editor}
    </div>
  );
}
