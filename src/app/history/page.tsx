import type { Metadata } from "next";
import { requireSpace, userNow } from "@/lib/dal";
import { listCategories } from "@/repositories/categories";
import { listAccountOptions } from "@/repositories/accounts";
import { listExpenses, summary } from "@/repositories/expenses";
import { getUserSettings } from "@/repositories/user-settings";
import { loadRateIndex } from "@/repositories/fx-rates";
import { CURRENCY_CODES } from "@/lib/currency";
import { sumConvertedByDay } from "@/lib/fx/convert";
import { resolveHistoryRange } from "@/lib/dates";
import { toDayGroups } from "@/lib/day-groups";
import { toExpenseEntry, type ExpenseEntry } from "@/lib/expense-entry";
import { AppScreen } from "@/components/layout/app-screen";
import { ScreenHeader } from "@/components/layout/screen-header";
import { HistoryFilter } from "@/components/history/history-filter";
import { PeriodTabs } from "@/components/history/period-tabs";
import type { DayGroup } from "@/components/history/history-list";

export const metadata: Metadata = { title: "История — moneta" };

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { user, spaceId } = await requireSpace();
  const { from, to } = await searchParams;
  const now = await userNow();
  const range = resolveHistoryRange(from, to, now);

  // The rate history is the heaviest read in this render, so it is loaded
  // once and threaded into every consumer below — summary, the row list and
  // the day totals would each repeat the identical query otherwise. It
  // depends only on the range, so it goes in this first batch rather than
  // waiting on the settings lookup.
  const [categories, accounts, settings, rateIndex] = await Promise.all([
    listCategories(spaceId),
    listAccountOptions(spaceId),
    getUserSettings(user.id),
    loadRateIndex([...CURRENCY_CODES], range.to),
  ]);
  const displayCurrency = settings.displayCurrency;

  const [periodSummary, rows] = await Promise.all([
    summary(spaceId, displayCurrency, range, rateIndex),
    listExpenses(
      spaceId,
      displayCurrency,
      { from: range.from, to: range.to },
      rateIndex,
    ),
  ]);
  const expenses = rows.map(toExpenseEntry);

  const expensesByCategory: Record<string, ExpenseEntry[]> = {};
  for (const e of expenses) {
    (expensesByCategory[e.categoryId] ??= []).push(e);
  }

  // Day totals are recomputed here (not read off periodSummary, which only
  // groups by category) via sumConvertedByDay, the same sumConverted
  // arithmetic the rest of the app uses, so a day's total follows the
  // identical rounding rules.
  const days: DayGroup[] = toDayGroups(
    sumConvertedByDay(expenses, displayCurrency, rateIndex),
    now,
  );

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
