import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { after } from "next/server";
import { requireSession } from "@/lib/dal";
import { listCategories } from "@/repositories/categories";
import { getUserSettings } from "@/repositories/user-settings";
import {
  PAGE_SYNC_THROTTLE_MS,
  syncUserRates,
} from "@/repositories/fx-rates";
import { CategoryManager } from "@/components/settings/category-manager";
import { SalaryDaysField } from "@/components/settings/salary-days-field";
import { DisplayCurrencySwitcher } from "@/components/settings/display-currency-switcher";
import { LogoutButton } from "@/components/logout-button";

export default async function SettingsPage() {
  const { user } = await requireSession();

  const [categories, settings] = await Promise.all([
    listCategories(user.id),
    getUserSettings(user.id),
  ]);

  // Same background fill setDisplayCurrencyAction triggers on an actual
  // switch (plan Step 4.5.4): the switcher itself early-returns when the
  // chosen currency already matches the stored one, so a user who never
  // changes currency would otherwise never get pending overrides repaired.
  // Throttled like the home page — this fires on plain navigation, not on a
  // change. cookies()/headers() aren't callable inside after(), so the id is
  // read above and closed over rather than re-derived inside the callback.
  const userId = user.id;
  after(() => syncUserRates(userId, { throttleMs: PAGE_SYNC_THROTTLE_MS }));

  return (
    <main className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-2xl">
      <header className="mb-6">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="size-4" /> На главную
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-text">Настройки</h1>
      </header>

      <section className="mb-6 rounded-lg border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-text">Категории</h2>
        <CategoryManager initialCategories={categories} />
      </section>

      <section className="mb-6 rounded-lg border border-border bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-text">Дни зарплаты</h2>
        <p className="mt-1 mb-4 text-sm text-text-muted">
          Укажите числа месяца, когда приходит зарплата
        </p>
        <SalaryDaysField initialSalaryDays={settings.salaryDays} />
      </section>

      <section className="mb-6 rounded-lg border border-border bg-surface p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-text">Валюта отображения</h2>
        <p className="mt-1 mb-4 text-sm text-text-muted">
          Валюта, в которой считаются итоги и списки трат
        </p>
        <DisplayCurrencySwitcher
          initialDisplayCurrency={settings.displayCurrency}
        />
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-text">Аккаунт</h2>
        <p className="mb-4 truncate text-sm text-text-muted">{user.email}</p>
        <LogoutButton />
      </section>
    </main>
  );
}
