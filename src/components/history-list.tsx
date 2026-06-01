"use client";

import { useState } from "react";
import type { Category } from "@/repositories/categories";
import type { Expense } from "@/repositories/expenses";
import { ExpenseRowContent } from "@/components/expense-row-content";
import { EditExpenseDialog } from "@/components/edit-expense-dialog";

export interface DayGroup {
  day: string;
  heading: string;
  items: Expense[];
}

export function HistoryList({
  groups,
  categories,
}: {
  groups: DayGroup[];
  categories: Category[];
}) {
  const [selected, setSelected] = useState<Expense | null>(null);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.day}>
          <h3 className="mb-1 px-2 text-sm font-medium text-text-muted">
            {group.heading}
          </h3>
          <ul className="flex flex-col">
            {group.items.map((expense) => {
              const category = categoryById.get(expense.categoryId);
              if (!category) return null;
              return (
                <li key={expense.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(expense)}
                    className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-raised"
                  >
                    <ExpenseRowContent
                      categoryName={category.name}
                      categoryColor={category.color}
                      amountMinor={expense.amountMinor}
                      subtitle={expense.note}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {selected ? (
        <EditExpenseDialog
          key={selected.id}
          expense={selected}
          categories={categories}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  );
}
