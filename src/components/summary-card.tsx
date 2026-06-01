import type { Expense, SummaryRow } from "@/repositories/expenses";
import { plural } from "@/lib/plural";
import { Money } from "@/components/ui/money";
import { SummaryBars } from "@/components/summary-bars";
import { cn } from "@/lib/utils";

// Period total + per-category breakdown, shared by the home (current week) and
// history (selected range) screens. The big number is the hero (MASTER); the
// title is a deliberately quiet section heading.
export function SummaryCard({
  title,
  totalMinor,
  count,
  byCategory,
  expensesByCategory,
  className,
}: {
  title: string;
  totalMinor: number;
  count: number;
  byCategory: SummaryRow[];
  expensesByCategory: Record<string, Expense[]>;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-lg border border-border bg-surface p-6", className)}
    >
      <h2 className="text-sm text-text-muted">{title}</h2>
      <p className="mt-1 text-3xl font-semibold text-text">
        <Money minor={totalMinor} />
      </p>
      <p className="mt-1 text-sm text-text-muted">
        {count > 0
          ? `по ${count} ${plural(count, ["трате", "тратам", "тратам"])}`
          : "Пока нет трат"}
      </p>

      {byCategory.length > 0 ? (
        <div className="mt-4">
          <SummaryBars
            rows={byCategory}
            total={totalMinor}
            expensesByCategory={expensesByCategory}
          />
        </div>
      ) : null}
    </section>
  );
}
