import { after } from "next/server";
import { addDays } from "date-fns";
import { requireSpace } from "@/lib/dal";
import { listCategories } from "@/repositories/categories";
import {
  lastUsedAccountId,
  lastUsedCategoryId,
  lastUsedCurrency,
  listExpenses,
} from "@/repositories/expenses";
import { listAccounts } from "@/repositories/accounts";
import { defaultAccountSelection } from "@/lib/expense-account";
import { getUserSettings } from "@/repositories/user-settings";
import {
  PAGE_SYNC_THROTTLE_MS,
  loadRateIndex,
  syncSpaceRates,
} from "@/repositories/fx-rates";
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
  const week = weekRange();
  const elapsed = currentWeekFromMonday();

  // One load for every consumer below. Bounded by maxEntryDate() rather than
  // the week: the recent list has no date filter of its own and its rows can
  // be dated up to a day ahead of this server (see provider.ts).
  const [settings, rateIndex] = await Promise.all([
    getUserSettings(user.id),
    loadRateIndex([...CURRENCY_CODES], maxEntryDate()),
  ]);
  const displayCurrency = settings.displayCurrency;

  const [
    categories,
    accounts,
    weekRows,
    recent,
    lastCategoryId,
    lastCurrency,
    lastAccountId,
  ] = await Promise.all([
    listCategories(spaceId),
    listAccounts(spaceId).then((rows) =>
      rows.map(({ id, name, currency }) => ({ id, name, currency })),
    ),
    listExpenses(spaceId, displayCurrency, elapsed, rateIndex),
    listExpenses(spaceId, displayCurrency, { limit: 10 }, rateIndex),
    lastUsedCategoryId(spaceId, user.id),
    lastUsedCurrency(spaceId, user.id),
    lastUsedAccountId(spaceId, user.id),
  ]);
  const selection = defaultAccountSelection({
    accounts,
    lastAccountId,
    lastCurrency,
    displayCurrency,
  });

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

  // The save path schedules its own rate fetch, but that one is
  // fire-and-forget: if the provider was down, nothing retried it. Opening
  // the app is the retry. Throttled, because this fires on plain navigation
  // too and the scan is over the space's whole expense history — the write
  // paths call syncSpaceRates without a throttle, so a real change still
  // converges immediately. cookies()/headers() aren't callable inside
  // after(), hence the closure.
  after(() => syncSpaceRates(spaceId, { throttleMs: PAGE_SYNC_THROTTLE_MS }));

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
        initialCategoryId={lastCategoryId ?? ""}
        initialCurrency={selection.currency}
        initialAccountId={selection.accountId}
        accounts={accounts}
        displayCurrency={displayCurrency}
      />
      {recent.length > 0 ? (
        <RecentList
          expenses={recent}
          categories={categories}
          accounts={accounts}
        />
      ) : null}
    </AppScreen>
  );
}
