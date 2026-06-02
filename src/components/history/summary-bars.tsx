"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Category } from "@/repositories/categories";
import type { Expense, SummaryRow } from "@/repositories/expenses";
import { formatRelativeDay } from "@/lib/dates";
import { Money } from "@/components/ui/money";
import { CategoryDot } from "@/components/ui/category-dot";
import { ExpenseRowContent } from "@/components/expenses/expense-row-content";
import { useExpenseEditor } from "@/components/expenses/use-expense-editor";
import { cn } from "@/lib/utils";

// Horizontal category breakdown (MASTER "Charts"): one bar per category, width
// proportional to its share of the total, sorted descending. Any number of
// categories can be open at once; clicking an expense row opens edit/delete.
export function SummaryBars({
  rows,
  total,
  expensesByCategory,
  categories,
}: {
  rows: SummaryRow[];
  total: number;
  expensesByCategory: Record<string, Expense[]>;
  categories: Category[];
}) {
  const { openEditor, editor } = useExpenseEditor(categories);

  return (
    <>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <SummaryBarRow
            key={row.categoryId}
            row={row}
            total={total}
            details={expensesByCategory[row.categoryId] ?? []}
            onSelect={openEditor}
          />
        ))}
      </ul>
      {editor}
    </>
  );
}

// Each category owns its open/closed state, so toggling one doesn't re-render
// the siblings — the rows are independent (no accordion / mutual exclusion).
function SummaryBarRow({
  row,
  total,
  details,
  onSelect,
}: {
  row: SummaryRow;
  total: number;
  details: Expense[];
  onSelect: (expense: Expense) => void;
}) {
  const [open, setOpen] = useState(false);
  const pct = total > 0 ? Math.round((row.totalMinor / total) * 100) : 0;

  return (
    <li>
      {/* Category header — no zebra: rows are told apart by the colour dot. */}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-border/60"
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
            open && "rotate-180",
          )}
        />
      </button>

      {/* Expense rows — zebra-striped; click opens edit/delete (like the day tab). */}
      {open ? (
        <ul className="mt-1 mb-2 flex flex-col gap-1 pl-6 pr-1">
          {details.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-text-muted">Нет трат</li>
          ) : (
            details.map((e, i) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onSelect(e)}
                  className={cn(
                    "flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-border/60",
                    i % 2 === 1 && "bg-surface-sunken",
                  )}
                >
                  <ExpenseRowContent
                    title={e.note}
                    subtitle={formatRelativeDay(e.spentAt)}
                    amountMinor={e.amountMinor}
                  />
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </li>
  );
}
