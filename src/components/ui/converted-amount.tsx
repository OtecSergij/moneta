import type { CurrencyCode } from "@/lib/currency";
import { Money } from "@/components/ui/money";

// One figure in the display currency; with no rate on file it falls back to
// the entered amount — never a silent 1:1 substitution.
export function ConvertedAmount({
  entry,
  className,
}: {
  entry: {
    amountMinor: number;
    currency: CurrencyCode;
    convertedMinor: number | null;
    displayCurrency: CurrencyCode;
  };
  className?: string;
}) {
  return (
    <Money
      minor={entry.convertedMinor ?? entry.amountMinor}
      currency={
        entry.convertedMinor === null
          ? entry.currency
          : entry.displayCurrency
      }
      className={className}
    />
  );
}
