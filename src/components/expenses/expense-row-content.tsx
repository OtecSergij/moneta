import type { CurrencyCode } from "@/lib/currency";
import { ConvertedMoney } from "@/components/ui/converted-money";
import { CategoryDot } from "@/components/ui/category-dot";

// Generic two-line expense row: optional colour dot + title over an optional
// subtitle + amount. Every list leads with the description (business-spec §5.2);
// the dot is omitted in History "По категориям" where the category is the group.
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
      <ConvertedMoney
        amountMinor={amountMinor}
        currency={currency}
        convertedMinor={convertedMinor}
        displayCurrency={displayCurrency}
        className="shrink-0"
      />
    </>
  );
}
