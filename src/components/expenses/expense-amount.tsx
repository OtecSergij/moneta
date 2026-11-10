import type { ExpenseWithConversion } from "@/repositories/expenses";
import { Money } from "@/components/ui/money";

// One figure in the display currency; with no rate on file it falls back to
// the entered amount — never a silent 1:1 substitution.
export function ExpenseAmount({
  expense,
  className,
}: {
  expense: ExpenseWithConversion;
  className?: string;
}) {
  return (
    <Money
      minor={expense.convertedMinor ?? expense.amountMinor}
      currency={
        expense.convertedMinor === null
          ? expense.currency
          : expense.displayCurrency
      }
      className={className}
    />
  );
}
