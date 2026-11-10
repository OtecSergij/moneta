import type { ReactNode } from "react";
import type { ExpenseWithConversion } from "@/repositories/expenses";
import { ExpenseRowContent } from "@/components/expenses/expense-row-content";
import { cn } from "@/lib/utils";

// Rows sit in a white rounded card; `index` > 0 draws the divider above.
export function ExpenseListRow({
  expense,
  color,
  title,
  when,
  subtitle,
  index,
  onClick,
}: {
  expense: ExpenseWithConversion;
  color?: string;
  title: string;
  when?: string;
  subtitle?: ReactNode;
  index: number;
  onClick: (expense: ExpenseWithConversion) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onClick(expense)}
        className={cn(
          "flex min-h-16 w-full cursor-pointer items-center gap-3 border-t px-4 py-[11px] text-left text-ink transition-colors hover:bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
          index === 0 ? "border-transparent" : "border-row-line",
        )}
      >
        <ExpenseRowContent
          expense={expense}
          color={color}
          title={title}
          when={when}
          subtitle={subtitle}
        />
      </button>
    </li>
  );
}
