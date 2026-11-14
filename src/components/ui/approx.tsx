import { type CurrencyCode } from "@/lib/currency";
import { Money } from "@/components/ui/money";

export function Approx({
  minor,
  currency,
  mutedSign = false,
  className,
}: {
  minor: number;
  currency: CurrencyCode;
  mutedSign?: boolean;
  className?: string;
}) {
  return (
    <span className={className}>
      <span aria-hidden="true" className={mutedSign ? "text-ink-3" : undefined}>
        {"≈ "}
      </span>
      <span className="sr-only">примерно </span>
      <Money minor={minor} currency={currency} />
    </span>
  );
}
