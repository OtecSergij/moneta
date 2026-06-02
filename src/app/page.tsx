import Link from "next/link";
import { ChevronRight, Settings } from "lucide-react";
import { requireSession } from "@/lib/dal";
import { listCategories } from "@/repositories/categories";
import {
  lastUsedCategoryId,
  listExpenses,
  summary,
} from "@/repositories/expenses";
import { currentWeekFromMonday } from "@/lib/dates";
import { Money } from "@/components/ui/money";
import { QuickAddForm } from "@/components/expenses/quick-add-form";
import { RecentList } from "@/components/expenses/recent-list";

export default async function HomePage() {
  const { user } = await requireSession();
  const week = currentWeekFromMonday();

  const [categories, weekSummary, recent, lastCategoryId] = await Promise.all([
    listCategories(user.id),
    summary(user.id, week),
    listExpenses(user.id, { limit: 10 }),
    lastUsedCategoryId(user.id),
  ]);

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

      {/* Week total — taps through to the full breakdown in History. */}
      <Link
        href="/history"
        aria-label="Траты за неделю — открыть историю"
        className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-6 transition-colors hover:bg-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        <span className="min-w-0">
          <span className="block text-sm text-text-muted">На этой неделе</span>
          <span className="mt-1 block text-3xl font-semibold text-text">
            <Money minor={weekSummary.totalMinor} />
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-text-muted"
        />
      </Link>

      <section className="mb-6 rounded-lg border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-text">Добавить трату</h2>
        <QuickAddForm
          initialCategories={categories}
          initialCategoryId={lastCategoryId ?? ""}
        />
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-2 text-lg font-semibold text-text">Последние</h2>
        {recent.length === 0 ? (
          <p className="py-4 text-sm text-text-muted">Пока нет трат</p>
        ) : (
          <RecentList expenses={recent} categories={categories} />
        )}
      </section>
    </main>
  );
}
