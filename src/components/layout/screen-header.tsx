import type { ReactNode } from "react";
import Link from "next/link";
import { Settings } from "lucide-react";
import type { CurrencyCode } from "@/lib/currency";
import { DisplayCurrencyChip } from "@/components/currency/display-currency-chip";
import { cn } from "@/lib/utils";

export function ScreenHeader({
  title,
  displayCurrency,
  action,
  showSettings = true,
  belowBack = false,
}: {
  title: string;
  displayCurrency?: CurrencyCode;
  action?: ReactNode;
  showSettings?: boolean;
  belowBack?: boolean;
}) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-2 pr-2.5 pl-5 lg:pr-4",
        belowBack ? "pt-1 lg:pt-9" : "pt-4 pb-2 lg:pt-8",
      )}
    >
      <h1 className="text-[28px]/9 font-bold tracking-[-0.02em]">{title}</h1>
      <div
        className={cn(
          "flex items-center",
          displayCurrency && !action ? "gap-1" : "gap-0.5",
        )}
      >
        {displayCurrency ? (
          <span className={cn("flex", action ? "mr-1" : undefined)}>
            <DisplayCurrencyChip initialCurrency={displayCurrency} />
          </span>
        ) : null}
        {action}
        {showSettings ? (
          <Link
            href="/settings"
            aria-label="Настройки"
            className="flex size-11 items-center justify-center rounded-control text-ink hover-ghost focus-visible:outline-2 focus-visible:outline-primary lg:hidden"
          >
            <Settings aria-hidden className="size-[22px]" strokeWidth={1.75} />
          </Link>
        ) : null}
      </div>
    </header>
  );
}
