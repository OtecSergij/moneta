"use client";

import type { ExpenseCategory } from "@/repositories/categories";
import type { ExpenseEntry } from "@/lib/expense-entry";
import { formatDayHeading, formatRelativeDay } from "@/lib/dates";
import { useCategoryById } from "@/lib/hooks/use-category-by-id";
import { useMounted } from "@/lib/hooks/use-mounted";
import { CardSection } from "@/components/kit/card-section";
import { ExpenseListRow } from "@/components/expenses/expense-list-row";
import { useExpenseEditor } from "@/components/expenses/use-expense-editor";
import type { ExpenseAccount } from "@/components/expenses/account-chips";

export function RecentList({
  expenses,
  categories,
  accounts,
}: {
  expenses: ExpenseEntry[];
  categories: ExpenseCategory[];
  accounts: ExpenseAccount[];
}) {
  const { openEditor, editor } = useExpenseEditor(categories, accounts, {
    isListed: (id) => expenses.some((e) => e.id === id),
  });
  const mounted = useMounted();
  const categoryById = useCategoryById(categories);

  return (
    <>
      <CardSection
        id="recent-title"
        title="Последние"
        titleGap="wide"
        className="mx-4 mt-7"
      >
        {expenses
          .flatMap((e) => {
            const category = categoryById.get(e.categoryId);
            return category ? [{ e, category }] : [];
          })
          .map(({ e, category }) => (
            <ExpenseListRow
              key={e.id}
              expense={e}
              category={category}
              when={
                mounted ? formatRelativeDay(e.spentAt) : formatDayHeading(e.spentAt)
              }
              onClick={openEditor}
            />
          ))}
      </CardSection>
      {editor}
    </>
  );
}
