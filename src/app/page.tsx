import { addDays } from "date-fns";
import { requireSpace, userNow } from "@/lib/dal";
import { listCategoriesWithUsage } from "@/repositories/categories";
import { lastUsedIds, listExpenses } from "@/repositories/expenses";
import { listAccountOptions } from "@/repositories/accounts";
import { defaultAccountSelection } from "@/lib/expense-account";
import { toExpenseEntry } from "@/lib/expense-entry";
import { getUserSettings } from "@/repositories/user-settings";
import { loadRateIndex } from "@/repositories/fx-rates";
import { CURRENCY_CODES } from "@/lib/currency";
import { maxEntryDate } from "@/lib/fx/provider";
import { sumConverted, sumConvertedByDay } from "@/lib/fx/convert";
import {
  currentWeekFromMonday,
  parseISODate,
  toISODate,
  weekRange,
} from "@/lib/dates";
import { AppScreen } from "@/components/layout/app-screen";
import { ScreenHeader } from "@/components/layout/screen-header";
import { WeekCard } from "@/components/expenses/week-card";
import { QuickAddForm } from "@/components/expenses/quick-add-form";
import { RecentList } from "@/components/expenses/recent-list";

export default async function HomePage() {
  const { user, spaceId } = await requireSpace();
  const now = await userNow();
  const week = weekRange(now);
  const elapsed = currentWeekFromMonday(now);

  // One load for every consumer below. Bounded by maxEntryDate() rather than
  // the week: the recent list has no date filter of its own and its rows can
  // be dated up to a day ahead of this server (see provider.ts).
  const [settings, rateIndex] = await Promise.all([
    getUserSettings(user.id),
    loadRateIndex([...CURRENCY_CODES], maxEntryDate()),
  ]);
  const displayCurrency = settings.displayCurrency;

  const [categories, accounts, weekRows, recent, lastUsed] = await Promise.all([
    listCategoriesWithUsage(spaceId),
    listAccountOptions(spaceId),
    listExpenses(spaceId, displayCurrency, elapsed, rateIndex),
    listExpenses(spaceId, displayCurrency, { limit: 10 }, rateIndex),
    lastUsedIds(spaceId, user.id),
  ]);
  const selection = defaultAccountSelection(
    accounts,
    lastUsed?.accountId ?? null,
  );

  const weekTotal = sumConverted(weekRows, displayCurrency, rateIndex);
  const byDay = new Map(
    sumConvertedByDay(weekRows, displayCurrency, rateIndex).map((b) => [
      b.day,
      b.totalMinor,
    ]),
  );
  const monday = parseISODate(week.from);
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = toISODate(addDays(monday, i));
    return { day, totalMinor: byDay.get(day) ?? 0 };
  });

  return (
    <AppScreen tab="main">
      <ScreenHeader title="Траты" displayCurrency={displayCurrency} />
      <WeekCard
        range={week}
        today={elapsed.to}
        days={days}
        totalMinor={weekTotal.totalMinor}
        unconverted={weekTotal.unconverted}
        currency={displayCurrency}
      />
      <QuickAddForm
        initialCategories={categories}
        initialCategoryId={lastUsed?.categoryId ?? ""}
        initialSelection={selection}
        accounts={accounts}
        displayCurrency={displayCurrency}
      />
      {recent.length > 0 ? (
        <RecentList
          expenses={recent.map(toExpenseEntry)}
          categories={categories}
          accounts={accounts}
        />
      ) : null}
    </AppScreen>
  );
}
