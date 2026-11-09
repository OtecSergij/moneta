import Link from "next/link";
import { after } from "next/server";
import { ChevronRight, Settings } from "lucide-react";
import { requireSession } from "@/lib/dal";
import { listCategories } from "@/repositories/categories";
import {
  lastUsedCategoryId,
  lastUsedCurrency,
  listExpenses,
  summary,
} from "@/repositories/expenses";
import { getUserSettings } from "@/repositories/user-settings";
import {
  PAGE_SYNC_THROTTLE_MS,
  loadRateIndex,
  syncUserRates,
} from "@/repositories/fx-rates";
import { CURRENCY_CODES } from "@/lib/currency";
import { maxEntryDate } from "@/lib/fx/provider";
import { currentWeekFromMonday } from "@/lib/dates";
import { TotalMoney } from "@/components/ui/total-money";
import { DisplayCurrencySwitcher } from "@/components/settings/display-currency-switcher";
import { QuickAddForm } from "@/components/expenses/quick-add-form";
import { RecentList } from "@/components/expenses/recent-list";

export default async function HomePage() {
  const { user } = await requireSession();
  const week = currentWeekFromMonday();

  // One load for both consumers below. Bounded by maxEntryDate() rather than
  // the week: the recent list has no date filter of its own and its rows can
  // be dated up to a day ahead of this server (see provider.ts).
  const [settings, rateIndex] = await Promise.all([
    getUserSettings(user.id),
    loadRateIndex([...CURRENCY_CODES], maxEntryDate()),
  ]);
  const displayCurrency = settings.displayCurrency;

  const [categories, weekSummary, recent, lastCategoryId, lastCurrency] =
    await Promise.all([
      listCategories(user.id),
      summary(user.id, displayCurrency, week, rateIndex),
      listExpenses(user.id, displayCurrency, { limit: 10 }, rateIndex),
      lastUsedCategoryId(user.id),
      lastUsedCurrency(user.id),
    ]);

  // The save path schedules its own rate fetch, but that one is
  // fire-and-forget: if the provider was down, nothing retried it. Opening
  // the app is the retry. Throttled, because this fires on plain navigation
  // too and the scan is over the user's whole expense history — the write
  // paths call syncUserRates without a throttle, so a real change still
  // converges immediately. cookies()/headers() aren't callable inside
  // after(), hence the closure.
  const userId = user.id;
  after(() => syncUserRates(userId, { throttleMs: PAGE_SYNC_THROTTLE_MS }));

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-2xl">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text">moneta</h1>
        <div className="flex items-center gap-2">
          <DisplayCurrencySwitcher initialDisplayCurrency={displayCurrency} />
          <Link
            href="/settings"
            aria-label="Настройки"
            className="inline-flex size-11 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            <Settings className="size-5" />
          </Link>
        </div>
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
            <TotalMoney
              minor={weekSummary.totalMinor}
              currency={displayCurrency}
              unconverted={weekSummary.unconverted}
            />
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
          initialCurrency={lastCurrency ?? displayCurrency}
          displayCurrency={displayCurrency}
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
