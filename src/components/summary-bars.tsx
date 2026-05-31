"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Expense, SummaryRow } from "@/repositories/expenses";
import { expenseSubtitle } from "@/lib/expense-display";
import { Money } from "@/components/ui/money";
import { CategoryDot } from "@/components/ui/category-dot";
import { cn } from "@/lib/utils";

// Horizontal category breakdown (MASTER "Charts"): one bar per category, width
// proportional to its share of the total, sorted descending (the repo already
// sorts). Clicking a bar expands that category's expenses for the period
// (business-spec §5.1.2 "Клик – раскрытие с деталями").
export function SummaryBars({
  rows,
  total,
  expensesByCategory,
}: {
  rows: SummaryRow[];
  total: number;
  expensesByCategory: Record<string, Expense[]>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <ul className="flex flex-col gap-1">
      {rows.map((row) => {
        const pct = total > 0 ? Math.round((row.totalMinor / total) * 100) : 0;
        const isOpen = openId === row.categoryId;
        const details = expensesByCategory[row.categoryId] ?? [];

        return (
          <li key={row.categoryId}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? null : row.categoryId)}
              className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 text-left hover:bg-surface-raised"
            >
              <CategoryDot color={row.color} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-text">{row.name}</span>
                  <Money minor={row.totalMinor} className="text-sm text-text" />
                </span>
                <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-pill bg-border">
                  <span
                    className="block h-full rounded-pill"
                    style={{ width: `${pct}%`, backgroundColor: row.color }}
                  />
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-text-muted transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            </button>

            {isOpen ? (
              <ul className="mt-1 mb-2 flex flex-col gap-1 pl-6 pr-1">
                {details.length === 0 ? (
                  <li className="text-sm text-text-muted">Нет трат</li>
                ) : (
                  details.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-2 text-sm text-text-muted"
                    >
                      <span className="truncate">
                        {expenseSubtitle(e.spentAt, e.note)}
                      </span>
                      <Money minor={e.amountMinor} />
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
