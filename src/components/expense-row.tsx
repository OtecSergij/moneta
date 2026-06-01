import type { Expense } from "@/repositories/expenses";
import { expenseSubtitle } from "@/lib/expense-display";
import { ExpenseRowContent } from "@/components/expense-row-content";

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
      <ExpenseRowContent
        categoryName={categoryName}
        categoryColor={categoryColor}
        amountMinor={expense.amountMinor}
        subtitle={expenseSubtitle(expense.spentAt, expense.note)}
      />
    </li>
  );
}
