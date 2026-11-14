"use client";

import { useState } from "react";
import type { ExpenseCategory } from "@/repositories/categories";
import type { SummaryRow } from "@/repositories/expenses";
import type { ExpenseEntry } from "@/lib/expense-entry";
import type { CurrencyCode } from "@/lib/currency";
import { EXPENSE_FORMS, formatCount } from "@/lib/plural";
import { TotalMoney } from "@/components/ui/total-money";
import { Segment } from "@/components/kit/segment";
import { SummaryCard } from "@/components/kit/summary-card";
import { SummaryBars } from "@/components/history/summary-bars";
import { HistoryList, type DayGroup } from "@/components/history/history-list";
import { useExpenseEditor } from "@/components/expenses/use-expense-editor";
import type { ExpenseAccount } from "@/components/expenses/account-chips";

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
  accounts,
  displayCurrency,
}: {
  totalMinor: number;
  unconverted: number;
  count: number;
  byCategory: SummaryRow[];
  expensesByCategory: Record<string, ExpenseEntry[]>;
  days: DayGroup[];
  categories: ExpenseCategory[];
  accounts: ExpenseAccount[];
  displayCurrency: CurrencyCode;
}) {
  const [tab, setTab] = useState<Tab>("categories");
  const { openEditor, editor } = useExpenseEditor(categories, accounts, {
    isListed: (id) =>
      Object.values(expensesByCategory).some((rows) => rows.some((e) => e.id === id)),
  });

  return (
    <div className="flex flex-col">
      <SummaryCard ariaLabel="Итог за период" label="Итого" className="mx-4 mt-3">
        <TotalMoney
          minor={totalMinor}
          currency={displayCurrency}
          unconverted={unconverted}
          size="period"
        />
        <span className="text-sm text-ink-2">
          {formatCount(count, EXPENSE_FORMS)}
        </span>
      </SummaryCard>

      {count > 0 ? (
        <>
          <Segment
            options={TABS}
            value={tab}
            onChange={setTab}
            ariaLabel="Вид сводки"
            surface="line"
            className="mx-4 mt-4"
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
