import type { CurrencyCode } from "@/lib/currency";
import { TotalMoney } from "@/components/ui/total-money";
import { Approx } from "@/components/ui/approx";
import { SummaryCard } from "@/components/kit/summary-card";

export function AccountBalanceCard({
  balanceMinor,
  currency,
  convertedMinor,
  displayCurrency,
}: {
  balanceMinor: number;
  currency: CurrencyCode;
  convertedMinor: number | null;
  displayCurrency: CurrencyCode;
}) {
  return (
    <SummaryCard ariaLabel="Остаток" label="Остаток" className="mx-4 mt-4">
      <TotalMoney
        minor={balanceMinor}
        currency={currency}
        unconverted={0}
        size="period"
      />
      {currency !== displayCurrency && convertedMinor !== null ? (
        <Approx
          minor={convertedMinor}
          currency={displayCurrency}
          className="text-sm text-ink-2"
        />
      ) : null}
    </SummaryCard>
  );
}
