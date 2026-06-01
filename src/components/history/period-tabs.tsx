"use client";

import { useState } from "react";
import type { Category } from "@/repositories/categories";
import type { Expense, SummaryRow } from "@/repositories/expenses";
import { Money } from "@/components/ui/money";
import { SummaryBars } from "@/components/history/summary-bars";
import { HistoryList, type DayGroup } from "@/components/history/history-list";
import { cn } from "@/lib/utils";

type Tab = "categories" | "days";

const TABS: { key: Tab; label: string }[] = [
  { key: "categories", label: "По категориям" },
  { key: "days", label: "По дням" },
];

export function PeriodTabs({
  totalMinor,
  byCategory,
  expensesByCategory,
  days,
  categories,
}: {
  totalMinor: number;
  byCategory: SummaryRow[];
  expensesByCategory: Record<string, Expense[]>;
  days: DayGroup[];
  categories: Category[];
}) {
  const [tab, setTab] = useState<Tab>("categories");
  const isEmpty = days.length === 0;

  return (
    <section className="rounded-lg border border-border bg-surface p-4 sm:p-6">
      <p className="text-3xl font-semibold text-text">
        <Money minor={totalMinor} />
      </p>

      {isEmpty ? (
        <p className="mt-4 text-sm text-text-muted">
          Нет трат за выбранный период
        </p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Вид сводки"
            className="mt-4 flex gap-4 border-b border-border"
          >
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`period-tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls="period-panel"
                onClick={() => setTab(t.key)}
                className={cn(
                  "-mb-px min-h-11 cursor-pointer border-b-2 px-1 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "border-accent text-text"
                    : "border-transparent text-text-muted hover:text-text"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div
            id="period-panel"
            role="tabpanel"
            aria-labelledby={`period-tab-${tab}`}
            className="mt-4"
          >
            {tab === "categories" ? (
              <SummaryBars
                rows={byCategory}
                total={totalMinor}
                expensesByCategory={expensesByCategory}
                categories={categories}
              />
            ) : (
              <HistoryList groups={days} categories={categories} />
            )}
          </div>
        </>
      )}
    </section>
  );
}
