"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { SummaryRow } from "@/repositories/expenses";
import type { ExpenseEntry } from "@/lib/expense-entry";
import type { CurrencyCode } from "@/lib/currency";
import { formatChipDate } from "@/lib/dates";
import { EXPENSE_FORMS, formatCount } from "@/lib/plural";
import { TotalMoney } from "@/components/ui/total-money";
import { RowGroup } from "@/components/kit/row-group";
import { ListRow } from "@/components/kit/list-row";
import { EntryRowContent } from "@/components/kit/entry-row-content";
import { ProgressBar } from "@/components/kit/progress-bar";
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
  expensesByCategory: Record<string, ExpenseEntry[]>;
  displayCurrency: CurrencyCode;
  onSelect: (expense: ExpenseEntry) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const max = Math.max(0, ...rows.map((r) => r.totalMinor));

  return (
    <RowGroup className="mx-4 mt-3">
      {rows.map((row) => {
        const open = row.categoryId === openId;
        const details = expensesByCategory[row.categoryId] ?? [];
        const width =
          max > 0 ? Math.max(3, Math.round((row.totalMinor / max) * 100)) : 3;
        const pct = total > 0 ? Math.round((row.totalMinor / total) * 100) : 0;
        return (
          <li key={row.categoryId}>
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
                <ProgressBar
                  percent={width}
                  color={row.color}
                  height={6}
                  className="flex-1"
                />
                <span className="w-9 text-right text-xs text-ink-2 tabular-nums">
                  {pct}%
                </span>
              </span>
            </button>

            {open ? (
              <RowGroup tone="page" className="mx-3 mb-3">
                {details.map((e) => (
                  <ListRow key={e.id} density="compact" onClick={() => onSelect(e)}>
                    <EntryRowContent
                      entry={e}
                      title={e.note}
                      when={formatChipDate(e.spentAt)}
                      density="compact"
                    />
                  </ListRow>
                ))}
              </RowGroup>
            ) : null}
          </li>
        );
      })}
    </RowGroup>
  );
}
