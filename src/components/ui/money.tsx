import { type CurrencyCode } from "@/lib/currency";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

// Renders a stored minor-unit amount with tabular figures so columns of money
// align vertically (MASTER.md "Money rendering").
export function Money({
  minor,
  currency,
  className,
}: {
  minor: number;
  currency: CurrencyCode;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>
      {formatMoney(minor, currency)}
    </span>
  );
}
