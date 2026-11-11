"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ExpenseWithConversion, SummaryRow } from "@/repositories/expenses";
import type { CurrencyCode } from "@/lib/currency";
import { formatChipDate } from "@/lib/dates";
import { EXPENSE_FORMS, formatCount } from "@/lib/plural";
import { TotalMoney } from "@/components/ui/total-money";
import { ExpenseAmount } from "@/components/expenses/expense-amount";
import { cn } from "@/lib/utils";

export function SummaryBars({
  rows,
  total,
  expensesByCategory,
  displayCurrency,
  onSelect,
}: {
  rows: SummaryRow[];
  total: number;
  expensesByCategory: Record<string, ExpenseWithConversion[]>;
  displayCurrency: CurrencyCode;
  onSelect: (expense: ExpenseWithConversion) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const max = Math.max(0, ...rows.map((r) => r.totalMinor));

  return (
    <ul className="mx-4 mt-3 overflow-hidden rounded-card bg-card">
      {rows.map((row, i) => {
        const open = row.categoryId === openId;
        const details = expensesByCategory[row.categoryId] ?? [];
        const width =
          max > 0 ? Math.max(3, Math.round((row.totalMinor / max) * 100)) : 3;
        const pct = total > 0 ? Math.round((row.totalMinor / total) * 100) : 0;
        return (
          <li
            key={row.categoryId}
            className={cn(i > 0 && "border-t border-row-line")}
          >
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : row.categoryId)}
              className="flex w-full cursor-pointer flex-col gap-2.5 px-4 py-3.5 text-left hover-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex w-full items-center gap-2">
                <span
                  aria-hidden
                  className="size-2.5 flex-none rounded-chip"
                  style={{ backgroundColor: row.color }}
                />
                <span className="min-w-0 truncate text-[15px] font-semibold">
                  {row.name}
                </span>
                <span className="shrink-0 text-[13px] text-ink-2">
                  {formatCount(details.length, EXPENSE_FORMS)}
                </span>
                <TotalMoney
                  minor={row.totalMinor}
                  currency={displayCurrency}
                  unconverted={row.unconverted}
                  className="ml-auto shrink-0 text-[15px] font-medium whitespace-nowrap"
                />
                <ChevronDown
                  aria-hidden
                  className={cn(
                    "size-[18px] shrink-0 text-ink-3 transition-transform",
                    open && "rotate-180",
                  )}
                  strokeWidth={1.75}
                />
              </span>
              <span className="flex w-full items-center gap-2.5">
                <span className="h-1.5 flex-1 overflow-hidden rounded-chip bg-page">
                  <span
                    className="block h-full rounded-chip"
                    style={{ width: `${width}%`, backgroundColor: row.color }}
                  />
                </span>
                <span className="w-9 text-right text-xs text-ink-2 tabular-nums">
                  {pct}%
                </span>
              </span>
            </button>

            {open ? (
              <ul className="mx-3 mb-3 overflow-hidden rounded-field bg-page">
                {details.map((e, j) => (
                  <li key={e.id} className={cn(j > 0 && "border-t border-line")}>
                    <button
                      type="button"
                      onClick={() => onSelect(e)}
                      className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-3.5 py-[9px] text-left hover-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[15px]/[18px] font-medium">
                          {e.note}
                        </span>
                        <span className="text-[13px]/[16px] text-ink-2">
                          {formatChipDate(e.spentAt)}
                        </span>
                      </span>
                      <ExpenseAmount
                        expense={e}
                        className="shrink-0 text-sm font-medium whitespace-nowrap"
                      />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
