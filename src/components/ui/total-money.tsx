import { type CurrencyCode } from "@/lib/currency";
import { formatMoneyParts } from "@/lib/money";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";

// An aggregate plus the count of rows no rate could value. Those rows
// contribute nothing to `minor`, so the figure is short by real money —
// rendered bare it would read as an exact number, and a category whose rows
// are all unconverted would read as a believable «0 ₽». The marker says the
// total is incomplete; the title says how many rows are missing from it.
export function TotalMoney({
  minor,
  currency,
  unconverted,
  size = "default",
  noteLabel = "Не пересчитано трат",
  noteReason = "нет курса на дату",
  className,
}: {
  minor: number;
  currency: CurrencyCode;
  unconverted: number;
  size?: "default" | "hero" | "period";
  noteLabel?: string;
  noteReason?: string;
  className?: string;
}) {
  // Count after the noun, so the phrase needs no Russian plural agreement.
  const note =
    unconverted === 0
      ? null
      : `${noteLabel}: ${unconverted} — ${noteReason}`;

  if (size !== "default") {
    const { amount, symbol } = formatMoneyParts(minor, currency);
    return (
      <span
        className={cn(
          "font-medium tracking-[-0.03em] tabular-nums",
          size === "hero" ? "text-[44px]/[52px]" : "text-[40px]/[48px]",
          className,
        )}
        title={note ?? undefined}
      >
        {note ? <span aria-hidden="true">≈ </span> : null}
        {amount}
        <span
          className={cn(
            "ml-2 text-ink-3",
            size === "hero" ? "text-[28px]" : "text-[26px]",
          )}
        >
          {symbol}
        </span>
        {note ? <span className="sr-only">{note}</span> : null}
      </span>
    );
  }

  if (!note) {
    return <Money minor={minor} currency={currency} className={className} />;
  }

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
