"use client";

import { useMemo } from "react";
import type { Category } from "@/repositories/categories";
import type { ExpenseWithConversion } from "@/repositories/expenses";
import type { CurrencyCode } from "@/lib/currency";
import { TotalMoney } from "@/components/ui/total-money";
import { ExpenseListRow } from "@/components/expenses/expense-list-row";
import { useExpenseEditor } from "@/components/expenses/use-expense-editor";

export interface DayGroup {
  day: string;
  heading: string;
  totalMinor: number;
  // Rows in this day no rate could value — see TotalMoney.
  unconverted: number;
  items: ExpenseWithConversion[];
}

export function HistoryList({
  groups,
  categories,
  displayCurrency,
}: {
  groups: DayGroup[];
  categories: Category[];
  displayCurrency: CurrencyCode;
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
            <span className="text-sm text-text">
              <TotalMoney
                minor={group.totalMinor}
                currency={displayCurrency}
                unconverted={group.unconverted}
              />
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {group.items.map((expense, i) => {
              const category = categoryById.get(expense.categoryId);
              if (!category) return null;
              return (
                <ExpenseListRow
                  key={expense.id}
                  expense={expense}
                  color={category.color}
                  title={expense.note}
                  subtitle={category.name}
                  index={i}
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
