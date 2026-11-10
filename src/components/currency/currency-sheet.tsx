"use client";

import { Check } from "lucide-react";
import { BottomSheet } from "@/components/kit/bottom-sheet";
import {
  CURRENCY_CODES,
  currencyMeta,
  type CurrencyCode,
} from "@/lib/currency";
import { cn } from "@/lib/utils";

const TITLE = "Валюта отображения";

export function CurrencySheet({
  open,
  onOpenChange,
  value,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: CurrencyCode;
  onSelect: (code: CurrencyCode) => void;
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      tone="gray"
      title={TITLE}
    >
      <div
        role="radiogroup"
        aria-label={TITLE}
        className="overflow-hidden rounded-group bg-card"
      >
        {CURRENCY_CODES.map((code, index) => {
          const { symbol, name } = currencyMeta(code);
          const checked = code === value;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onSelect(code)}
              className={cn(
                "flex min-h-[60px] w-full cursor-pointer items-center gap-3.5 px-4 py-2.5 text-left text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                index > 0 && "border-t border-row-line",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-9 flex-none items-center justify-center rounded-[10px] font-semibold",
                  symbol.length > 1 ? "text-[11px]" : "text-[17px]",
                  checked
                    ? "bg-primary-soft text-primary-ink"
                    : "bg-page text-ink-badge",
                )}
              >
                {symbol}
              </span>
              <span className="flex-1 text-base font-medium">{name}</span>
              {checked ? (
                <Check
                  aria-hidden
                  className="size-[22px] text-primary"
                  strokeWidth={1.75}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
