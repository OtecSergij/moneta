import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { requireSpace } from "@/lib/dal";
import { listCategories } from "@/repositories/categories";
import {
  listExpenses,
  summary,
  type ExpenseWithConversion,
} from "@/repositories/expenses";
import { getUserSettings } from "@/repositories/user-settings";
import { loadRateIndex } from "@/repositories/fx-rates";
import { CURRENCY_CODES } from "@/lib/currency";
import { sumConvertedByDay } from "@/lib/fx/convert";
import { formatRelativeDay, todayRange } from "@/lib/dates";
import { DisplayCurrencySwitcher } from "@/components/settings/display-currency-switcher";
import { HistoryFilter } from "@/components/history/history-filter";
import { PeriodTabs } from "@/components/history/period-tabs";
import type { DayGroup } from "@/components/history/history-list";

const isoDate = z.iso.date();

// Resolve the URL range, defaulting to today (business-spec §5.2) when
// params are missing/invalid or reversed.
function resolveRange(from?: string, to?: string) {
  const f = isoDate.safeParse(from);
  const t = isoDate.safeParse(to);
  if (f.success && t.success && f.data <= t.data) {
    return { from: f.data, to: t.data };
  }
  return todayRange();
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user, spaceId } = await requireSpace();
  const { from, to } = await searchParams;
  const range = resolveRange(from, to);

  // The rate history is the heaviest read in this render, so it is loaded
  // once and threaded into every consumer below — summary, the row list and
  // the day totals would each repeat the identical query otherwise. It
  // depends only on the range, so it goes in this first batch rather than
  // waiting on the settings lookup.
  const [categories, settings, rateIndex] = await Promise.all([
    listCategories(spaceId),
    getUserSettings(user.id),
    loadRateIndex([...CURRENCY_CODES], range.to),
  ]);
  const displayCurrency = settings.displayCurrency;

  const [periodSummary, expenses] = await Promise.all([
    summary(spaceId, displayCurrency, range, rateIndex),
    listExpenses(
      spaceId,
      displayCurrency,
      { from: range.from, to: range.to },
      rateIndex,
    ),
  ]);

  const expensesByCategory: Record<string, ExpenseWithConversion[]> = {};
  for (const e of expenses) {
    (expensesByCategory[e.categoryId] ??= []).push(e);
  }

  // Day totals are recomputed here (not read off periodSummary, which only
  // groups by category) via sumConvertedByDay, the same sumConverted
  // arithmetic the rest of the app uses, so a day's total follows the
  // identical rounding rules.
  const days: DayGroup[] = sumConvertedByDay(
    expenses,
    displayCurrency,
    rateIndex,
  ).map((bucket) => ({
    day: bucket.day,
    heading: formatRelativeDay(bucket.day),
    totalMinor: bucket.totalMinor,
    unconverted: bucket.unconverted,
    items: bucket.items,
  }));

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-2xl">
      <header className="mb-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="size-4" /> На главную
        </Link>
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold text-text">История</h1>
          <DisplayCurrencySwitcher initialDisplayCurrency={displayCurrency} />
        </div>
      </header>

      <section className="mb-6 rounded-lg border border-border bg-surface p-4 sm:p-6">
        <HistoryFilter from={range.from} to={range.to} />
      </section>

      <PeriodTabs
        totalMinor={periodSummary.totalMinor}
        unconverted={periodSummary.unconverted}
        byCategory={periodSummary.byCategory}
        expensesByCategory={expensesByCategory}
        days={days}
        categories={categories}
        displayCurrency={displayCurrency}
      />
    </main>
  );
}
