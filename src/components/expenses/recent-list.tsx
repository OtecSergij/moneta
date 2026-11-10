"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { Category } from "@/repositories/categories";
import type { ExpenseWithConversion } from "@/repositories/expenses";
import { formatDayHeading, formatRelativeDay } from "@/lib/dates";
import { ExpenseListRow } from "@/components/expenses/expense-list-row";
import { useExpenseEditor } from "@/components/expenses/use-expense-editor";
import type { ExpenseAccount } from "@/components/expenses/account-chips";

export function RecentList({
  expenses,
  categories,
  accounts,
}: {
  expenses: ExpenseWithConversion[];
  categories: Category[];
  accounts: ExpenseAccount[];
}) {
  const { openEditor, editor } = useExpenseEditor(categories, accounts);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  return (
    <section aria-labelledby="recent-title" className="mx-4 mt-7">
      <h2
        id="recent-title"
        className="px-1 pb-2.5 text-[17px] font-semibold"
      >
        Последние
      </h2>
      <ul className="overflow-hidden rounded-card bg-card">
        {expenses
          .flatMap((e) => {
            const category = categoryById.get(e.categoryId);
            return category ? [{ e, category }] : [];
          })
          .map(({ e, category }, i) => (
            <ExpenseListRow
              key={e.id}
              expense={e}
              color={category.color}
              title={e.note}
              when={
                mounted ? formatRelativeDay(e.spentAt) : formatDayHeading(e.spentAt)
              }
              subtitle={category.name}
              index={i}
              onClick={openEditor}
            />
          ))}
      </ul>
      {editor}
    </section>
  );
}
