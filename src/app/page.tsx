import Link from "next/link";
import { Settings } from "lucide-react";
import { requireSession } from "@/lib/dal";
import { listCategories } from "@/repositories/categories";
import { listExpenses, summary, type Expense } from "@/repositories/expenses";
import { currentWeekFromMonday } from "@/lib/dates";
import { QuickAddForm } from "@/components/quick-add-form";
import { SummaryCard } from "@/components/summary-card";
import { ExpenseRow } from "@/components/expense-row";

export default async function HomePage() {
  const { user } = await requireSession();
  const week = currentWeekFromMonday();

  const [categories, weekSummary, weekExpenses, recent] = await Promise.all([
    listCategories(user.id),
    summary(user.id, week),
    listExpenses(user.id, { from: week.from, to: week.to }),
    listExpenses(user.id, { limit: 10 }),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const expensesByCategory: Record<string, Expense[]> = {};
  for (const e of weekExpenses) {
    (expensesByCategory[e.categoryId] ??= []).push(e);
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-2xl">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">moneta</h1>
        <Link
          href="/settings"
          aria-label="Настройки"
          className="inline-flex size-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        >
          <Settings className="size-5" />
        </Link>
      </header>

      <SummaryCard
        className="mb-6"
        title="На этой неделе"
        totalMinor={weekSummary.totalMinor}
        count={weekExpenses.length}
        byCategory={weekSummary.byCategory}
        expensesByCategory={expensesByCategory}
      />

      <section className="mb-6 rounded-lg border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-text">Добавить трату</h2>
        <QuickAddForm initialCategories={categories} />
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-2 text-lg font-semibold text-text">Последние</h2>
        {recent.length === 0 ? (
          <p className="py-4 text-sm text-text-muted">Пока нет трат</p>
        ) : (
          <>
            <ul className="divide-y divide-border">
              {recent.map((e) => {
                const category = categoryById.get(e.categoryId);
                if (!category) return null;
                return (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    categoryName={category.name}
                    categoryColor={category.color}
                  />
                );
              })}
            </ul>
            <div className="mt-3 text-right">
              <Link
                href="/history"
                className="inline-flex min-h-11 items-center text-sm text-accent hover:text-accent-hover"
              >
                Вся история →
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
