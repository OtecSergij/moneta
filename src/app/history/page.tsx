import { requireSpace } from "@/lib/dal";
import { listCategories } from "@/repositories/categories";
import { listAccounts } from "@/repositories/accounts";
import {
  listExpenses,
  summary,
  type ExpenseWithConversion,
} from "@/repositories/expenses";
import { getUserSettings } from "@/repositories/user-settings";
import { loadRateIndex } from "@/repositories/fx-rates";
import { CURRENCY_CODES } from "@/lib/currency";
import { sumConvertedByDay } from "@/lib/fx/convert";
import { formatDayTitle, resolveHistoryRange } from "@/lib/dates";
import { AppScreen } from "@/components/layout/app-screen";
import { ScreenHeader } from "@/components/layout/screen-header";
import { HistoryFilter } from "@/components/history/history-filter";
import { PeriodTabs } from "@/components/history/period-tabs";
import type { DayGroup } from "@/components/history/history-list";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user, spaceId } = await requireSpace();
  const { from, to } = await searchParams;
  const range = resolveHistoryRange(from, to);

  // The rate history is the heaviest read in this render, so it is loaded
  // once and threaded into every consumer below — summary, the row list and
  // the day totals would each repeat the identical query otherwise. It
  // depends only on the range, so it goes in this first batch rather than
  // waiting on the settings lookup.
  const [categories, accounts, settings, rateIndex] = await Promise.all([
    listCategories(spaceId),
    listAccounts(spaceId).then((rows) =>
      rows.map(({ id, name, currency }) => ({ id, name, currency })),
    ),
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
    heading: formatDayTitle(bucket.day),
    totalMinor: bucket.totalMinor,
    unconverted: bucket.unconverted,
    items: bucket.items,
  }));

  return (
    <AppScreen tab="history">
      <ScreenHeader title="История" displayCurrency={displayCurrency} />
      <HistoryFilter from={range.from} to={range.to} />
      <PeriodTabs
        totalMinor={periodSummary.totalMinor}
        unconverted={periodSummary.unconverted}
        count={expenses.length}
        byCategory={periodSummary.byCategory}
        expensesByCategory={expensesByCategory}
        days={days}
        categories={categories}
        accounts={accounts}
        displayCurrency={displayCurrency}
      />
    </AppScreen>
  );
}
