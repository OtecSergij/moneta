import { type CurrencyCode } from "@/lib/currency";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";

// Row-level amount display: the converted figure leads, at the same weight
// every list already renders money at; the entered amount only follows as a
// muted second line when it was entered in a different currency (plan
// principle 1 — the entered amount is never hidden, only backgrounded once
// it's not what the user is scanning the list for). Falls back to the
// entered amount as the primary figure when no rate reached it — no silent
// 1:1 substitution. That fallback is only reachable before the first rate
// for a currency has ever been stored, and it heals on the next fetch.
export function ConvertedMoney({
  amountMinor,
  currency,
  convertedMinor,
  displayCurrency,
  className,
}: {
  amountMinor: number;
  currency: CurrencyCode;
  convertedMinor: number | null;
  displayCurrency: CurrencyCode;
  className?: string;
}) {
  if (convertedMinor === null) {
    return (
      <Money
        minor={amountMinor}
        currency={currency}
        className={cn("text-sm text-text", className)}
      />
    );
  }

  if (currency === displayCurrency) {
    return (
      <Money
        minor={convertedMinor}
        currency={displayCurrency}
        className={cn("text-sm text-text", className)}
      />
    );
  }

  return (
    <span className={cn("flex flex-col items-end", className)}>
      <Money minor={convertedMinor} currency={displayCurrency} className="text-sm text-text" />
      <Money minor={amountMinor} currency={currency} className="text-xs text-text-muted" />
    </span>
  );
}
