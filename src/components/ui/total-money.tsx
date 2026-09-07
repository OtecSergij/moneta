import { type CurrencyCode } from "@/lib/currency";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";

// An aggregate plus the count of rows no rate could value. Those rows
// contribute nothing to `minor`, so the figure is short by real money —
// rendered bare it would read as an exact number, and a category whose rows
// are all unconverted would read as a believable «₽ 0». The marker says the
// total is incomplete; the title says how many rows are missing from it.
export function TotalMoney({
  minor,
  currency,
  unconverted,
  className,
}: {
  minor: number;
  currency: CurrencyCode;
  unconverted: number;
  className?: string;
}) {
  if (unconverted === 0) {
    return <Money minor={minor} currency={currency} className={className} />;
  }

  // Count after the noun, so the phrase needs no Russian plural agreement.
  const note = `Не пересчитано трат: ${unconverted} — нет курса на дату`;

  return (
    <span
      className={cn("inline-flex items-baseline gap-1", className)}
      title={note}
    >
      <span aria-hidden="true">≈</span>
      <Money minor={minor} currency={currency} />
      <span className="sr-only">{note}</span>
    </span>
  );
}
