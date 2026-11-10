import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { Plus, Settings } from "lucide-react";
import type { CurrencyCode } from "@/lib/currency";
import { DisplayCurrencyChip } from "@/components/currency/display-currency-chip";
import { cn } from "@/lib/utils";

export function ScreenHeader({
  title,
  displayCurrency,
  action,
}: {
  title: string;
  displayCurrency?: CurrencyCode;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-2 pt-4 pr-2.5 pb-2 pl-5">
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
        <Link
          href="/settings"
          aria-label="Настройки"
          className="flex size-11 items-center justify-center rounded-[12px] text-ink focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Settings aria-hidden className="size-[22px]" strokeWidth={1.75} />
        </Link>
      </div>
    </header>
  );
}

export function HeaderAddButton({
  label,
  ...props
}: Omit<
  ComponentProps<"button">,
  "children" | "aria-label" | "className" | "type"
> & {
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-11 cursor-pointer items-center justify-center rounded-chip bg-select text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      {...props}
    >
      <Plus aria-hidden className="size-[22px]" strokeWidth={1.75} />
    </button>
  );
}
