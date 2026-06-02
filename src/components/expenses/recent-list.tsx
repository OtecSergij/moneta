"use client";

import { useMemo } from "react";
import type { Category } from "@/repositories/categories";
import type { Expense } from "@/repositories/expenses";
import { formatRelativeDay } from "@/lib/dates";
import { ExpenseListRow } from "@/components/expenses/expense-list-row";
import { useExpenseEditor } from "@/components/expenses/use-expense-editor";

// Home "Последние" list — same edit/delete dialog as History, so a just-logged
// expense can be fixed without leaving the home screen. Flat (not day-grouped):
// each row carries its own date in the subtitle.
export function RecentList({
  expenses,
  categories,
}: {
  expenses: Expense[];
  categories: Category[];
}) {
  const { openEditor, editor } = useExpenseEditor(categories);
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  return (
    <>
      <ul className="flex flex-col gap-1">
        {expenses.map((e, i) => {
          const category = categoryById.get(e.categoryId);
          if (!category) return null;
          return (
            <ExpenseListRow
              key={e.id}
              expense={e}
              color={category.color}
              title={e.note}
              subtitle={`${formatRelativeDay(e.spentAt)} · ${category.name}`}
              index={i}
              onClick={openEditor}
            />
          );
        })}
      </ul>
      {editor}
    </>
  );
}
