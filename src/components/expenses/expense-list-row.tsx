import type { Expense } from "@/repositories/expenses";
import { ExpenseRowContent } from "@/components/expenses/expense-row-content";
import { cn } from "@/lib/utils";

// One clickable, zebra-striped expense row — shared by the home "Последние" list
// and the History day list. `index` drives the zebra tint (even rows tinted).
// Both lead with the description (business-spec §5.2): the subtitle is
// "дата · категория" on home (flat list) and just the category under a day
// heading in History. Clicking calls `onClick(expense)` (→ edit/delete dialog).
export function ExpenseListRow({
  expense,
  color,
  title,
  subtitle,
  index,
  onClick,
}: {
  expense: Expense;
  color: string;
  title: string;
  subtitle?: string | null;
  index: number;
  onClick: (expense: Expense) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onClick(expense)}
        className={cn(
          "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-border/60",
          index % 2 === 1 && "bg-surface-sunken",
        )}
      >
        <ExpenseRowContent
          color={color}
          title={title}
          subtitle={subtitle}
          amountMinor={expense.amountMinor}
        />
      </button>
    </li>
  );
}
