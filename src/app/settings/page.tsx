import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireSession } from "@/lib/dal";
import { listCategories } from "@/repositories/categories";
import { getUserSettings } from "@/repositories/user-settings";
import { CategoryManager } from "@/components/settings/category-manager";
import { SalaryDaysField } from "@/components/settings/salary-days-field";
import { LogoutButton } from "@/components/logout-button";

export default async function SettingsPage() {
  const { user } = await requireSession();

  const [categories, settings] = await Promise.all([
    listCategories(user.id),
    getUserSettings(user.id),
  ]);

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

      <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold text-text">Аккаунт</h2>
        <p className="mb-4 truncate text-sm text-text-muted">{user.email}</p>
        <LogoutButton />
      </section>
    </main>
  );
}
