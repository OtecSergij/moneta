"use client";

import { useMemo } from "react";
import type { Category } from "@/repositories/categories";
import type { ExpenseWithConversion } from "@/repositories/expenses";
import type { CurrencyCode } from "@/lib/currency";
import { TotalMoney } from "@/components/ui/total-money";
import { ExpenseListRow } from "@/components/expenses/expense-list-row";

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
  onSelect,
}: {
  groups: DayGroup[];
  categories: Category[];
  displayCurrency: CurrencyCode;
  onSelect: (expense: ExpenseWithConversion) => void;
}) {
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  return (
    <div className="mx-4 mt-1 flex flex-col">
      {groups.map((group) => (
        <section key={group.day} className="flex flex-col">
          <div className="flex items-baseline justify-between gap-2 px-1 pt-[18px] pb-2">
            <h2 className="text-sm font-semibold">{group.heading}</h2>
            <TotalMoney
              minor={group.totalMinor}
              currency={displayCurrency}
              unconverted={group.unconverted}
              className="text-[13px] text-ink-2"
            />
          </div>
          <ul className="overflow-hidden rounded-card bg-card">
            {group.items.map((expense, i) => {
              const category = categoryById.get(expense.categoryId);
              return (
                <ExpenseListRow
                  key={expense.id}
                  expense={expense}
                  color={category?.color}
                  title={expense.note}
                  subtitle={category?.name}
                  index={i}
                  onClick={onSelect}
                />
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
