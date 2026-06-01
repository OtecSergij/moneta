import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireSession } from "@/lib/dal";
import { listCategories } from "@/repositories/categories";
import { listExpenses, summary, type Expense } from "@/repositories/expenses";
import { formatDayHeading, lastNDays } from "@/lib/dates";
import { SummaryCard } from "@/components/summary-card";
import { HistoryFilter } from "@/components/history-filter";
import { HistoryList } from "@/components/history-list";

const isoDate = z.iso.date();

// Resolve the URL range, defaulting to the last 7 days (business-spec §5.2)
// when params are missing/invalid or reversed.
function resolveRange(from?: string, to?: string) {
  const f = isoDate.safeParse(from);
  const t = isoDate.safeParse(to);
  if (f.success && t.success && f.data <= t.data) {
    return { from: f.data, to: t.data };
  }
  return lastNDays(7);
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user } = await requireSession();
  const { from, to } = await searchParams;
  const range = resolveRange(from, to);

  const [categories, periodSummary, expenses] = await Promise.all([
    listCategories(user.id),
    summary(user.id, range),
    listExpenses(user.id, { from: range.from, to: range.to }),
  ]);

  const expensesByCategory: Record<string, Expense[]> = {};
  for (const e of expenses) {
    (expensesByCategory[e.categoryId] ??= []).push(e);
  }

  const days: { day: string; heading: string; items: Expense[] }[] = [];
  for (const e of expenses) {
    const last = days[days.length - 1];
    if (last && last.day === e.spentAt) last.items.push(e);
    else
      days.push({
        day: e.spentAt,
        heading: formatDayHeading(e.spentAt),
        items: [e],
      });
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-2xl">
      <header className="mb-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="size-4" /> На главную
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-text">История</h1>
      </header>

      <section className="mb-6 rounded-lg border border-border bg-surface p-4 sm:p-6">
        <HistoryFilter from={range.from} to={range.to} />
      </section>

      <SummaryCard
        className="mb-6"
        title="За период"
        totalMinor={periodSummary.totalMinor}
        count={expenses.length}
        byCategory={periodSummary.byCategory}
        expensesByCategory={expensesByCategory}
      />

      <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-3 text-lg font-semibold text-text">Список</h2>
        {days.length === 0 ? (
          <p className="py-4 text-sm text-text-muted">
            Нет трат за выбранный период
          </p>
        ) : (
          <HistoryList groups={days} categories={categories} />
        )}
      </section>
    </main>
  );
}
