"use client";

import type { ExpenseCategory } from "@/repositories/categories";
import type { ExpenseEntry } from "@/lib/expense-entry";
import type { CurrencyCode } from "@/lib/currency";
import { useCategoryById } from "@/lib/hooks/use-category-by-id";
import { DayList, type Day } from "@/components/kit/day-list";
import { ExpenseListRow } from "@/components/expenses/expense-list-row";

export type DayGroup = Day<ExpenseEntry>;

export function HistoryList({
  groups,
  categories,
  displayCurrency,
  onSelect,
}: {
  groups: DayGroup[];
  categories: ExpenseCategory[];
  displayCurrency: CurrencyCode;
  onSelect: (expense: ExpenseEntry) => void;
}) {
  const categoryById = useCategoryById(categories);

  return (
    <DayList days={groups} displayCurrency={displayCurrency}>
      {(expense) => (
        <ExpenseListRow
          key={expense.id}
          expense={expense}
          category={categoryById.get(expense.categoryId)}
          onClick={onSelect}
        />
      )}
    </DayList>
  );
}
