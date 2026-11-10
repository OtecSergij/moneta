"use client";

import { useState } from "react";
import type { Category } from "@/repositories/categories";
import type { ExpenseWithConversion, SummaryRow } from "@/repositories/expenses";
import type { CurrencyCode } from "@/lib/currency";
import { EXPENSE_FORMS, formatCount } from "@/lib/plural";
import { TotalMoney } from "@/components/ui/total-money";
import { Segment } from "@/components/kit/segment";
import { SummaryBars } from "@/components/history/summary-bars";
import { HistoryList, type DayGroup } from "@/components/history/history-list";
import { useExpenseEditor } from "@/components/expenses/use-expense-editor";

type Tab = "categories" | "days";

const TABS = [
  { value: "categories", label: "По категориям" },
  { value: "days", label: "По дням" },
] as const;

export function PeriodTabs({
  totalMinor,
  unconverted,
  count,
  byCategory,
  expensesByCategory,
  days,
  categories,
  displayCurrency,
}: {
  totalMinor: number;
  unconverted: number;
  count: number;
  byCategory: SummaryRow[];
  expensesByCategory: Record<string, ExpenseWithConversion[]>;
  days: DayGroup[];
  categories: Category[];
  displayCurrency: CurrencyCode;
}) {
  const [tab, setTab] = useState<Tab>("categories");
  const { openEditor, editor } = useExpenseEditor(categories);

  return (
    <div className="flex flex-col pb-6">
      <section
        aria-label="Итог за период"
        className="mx-4 mt-3 flex flex-col gap-1 rounded-card bg-card p-5"
      >
        <span className="text-sm text-ink-2">Итого</span>
        <TotalMoney
          minor={totalMinor}
          currency={displayCurrency}
          unconverted={unconverted}
          size="period"
        />
        <span className="text-sm text-ink-2">
          {formatCount(count, EXPENSE_FORMS)}
        </span>
      </section>

      {count > 0 ? (
        <>
          <Segment
            options={TABS}
            value={tab}
            onChange={setTab}
            ariaLabel="Вид сводки"
            className="mx-4 mt-4 bg-line!"
          />
          {tab === "categories" ? (
            <SummaryBars
              rows={byCategory}
              total={totalMinor}
              expensesByCategory={expensesByCategory}
              displayCurrency={displayCurrency}
              onSelect={openEditor}
            />
          ) : (
            <HistoryList
              groups={days}
              categories={categories}
              displayCurrency={displayCurrency}
              onSelect={openEditor}
            />
          )}
        </>
      ) : null}
      {editor}
    </div>
  );
}
