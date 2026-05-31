import type { Expense } from "@/repositories/expenses";
import { expenseSubtitle } from "@/lib/expense-display";
import { Money } from "@/components/ui/money";
import { CategoryDot } from "@/components/ui/category-dot";

// Read-only expense list row for the home "Последние" list (business-spec
// §5.1.4). Category name/colour are resolved by the parent (one categories
// fetch, looked up per row) so this stays a plain presentational component.
export function ExpenseRow({
  expense,
  categoryName,
  categoryColor,
}: {
  expense: Expense;
  categoryName: string;
  categoryColor: string;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <CategoryDot color={categoryColor} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-text">{categoryName}</span>
          <Money minor={expense.amountMinor} className="text-sm text-text" />
        </div>
        <div className="truncate text-xs text-text-muted">
          {expenseSubtitle(expense.spentAt, expense.note)}
        </div>
      </div>
    </li>
  );
}
