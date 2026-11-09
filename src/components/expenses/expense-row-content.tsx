import type { CurrencyCode } from "@/lib/currency";
import { Money } from "@/components/ui/money";
import { CategoryDot } from "@/components/ui/category-dot";

// Generic two-line expense row: optional colour dot + title over an optional
// subtitle + amount. Every list leads with the description (business-spec §5.2);
// the dot is omitted in History "По категориям" where the category is the group.
//
// The amount is one figure in the display currency (MASTER.md "List row
// pattern"); the entered amount is only shown in the expense card. With no
// rate on file for the row's currency it falls back to the entered amount —
// never a silent 1:1 substitution.
export function ExpenseRowContent({
  color,
  title,
  subtitle,
  amountMinor,
  currency,
  convertedMinor,
  displayCurrency,
}: {
  color?: string;
  title: string;
  subtitle?: string | null;
  amountMinor: number;
  currency: CurrencyCode;
  convertedMinor: number | null;
  displayCurrency: CurrencyCode;
}) {
  return (
    <>
      {color ? <CategoryDot color={color} /> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-text">{title}</div>
        {subtitle ? (
          <div className="truncate text-xs text-text-muted">{subtitle}</div>
        ) : null}
      </div>
      <Money
        minor={convertedMinor ?? amountMinor}
        currency={convertedMinor === null ? currency : displayCurrency}
        className="shrink-0 text-sm text-text"
      />
    </>
  );
}
