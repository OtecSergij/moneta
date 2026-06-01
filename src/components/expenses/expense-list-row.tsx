import type { Category } from "@/repositories/categories";
import type { Expense } from "@/repositories/expenses";
import { ExpenseRowContent } from "@/components/expenses/expense-row-content";
import { cn } from "@/lib/utils";

// One clickable, zebra-striped expense row — shared by the home "Последние" list
// and the History day list. `index` drives the zebra tint (even rows tinted);
// `subtitle` differs per list (date·note on home, just the note under a day
// heading in History). Clicking calls `onClick(expense)` (→ edit/delete dialog).
export function ExpenseListRow({
  expense,
  category,
  subtitle,
  index,
  onClick,
}: {
  expense: Expense;
  category: Category;
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
          categoryName={category.name}
          categoryColor={category.color}
          amountMinor={expense.amountMinor}
          subtitle={subtitle}
        />
      </button>
    </li>
  );
}
