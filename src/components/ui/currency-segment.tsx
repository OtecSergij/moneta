"use client";

import { useRef } from "react";
import {
  CURRENCY_CODES,
  currencyMeta,
  type CurrencyCode,
} from "@/lib/currency";
import { cn } from "@/lib/utils";

// Segmented control over currency codes. `role="radiogroup"` + roving
// tabindex (only the checked option sits in the tab order — Tab skips past
// the whole group in one stop, arrow keys move *and* select within it),
// matching the WAI-ARIA radiogroup keyboard pattern. `options` narrows the
// choices — the charged-amount fixation excludes the entry's own currency
// (see charged-amount-field.tsx) — and defaults to all five.
export function CurrencySegment({
  value,
  onChange,
  options = CURRENCY_CODES,
  label,
}: {
  value: CurrencyCode | undefined;
  onChange: (value: CurrencyCode) => void;
  options?: readonly CurrencyCode[];
  label: string;
}) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1.5">
      {options.map((code, index) => {
        const checked = code === value;
        return (
          <button
            key={code}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={code}
            // Roving tabindex: the checked option owns the tab stop; with nothing
            // checked yet the first option takes it so the group stays reachable.
            tabIndex={checked || (value === undefined && index === 0) ? 0 : -1}
            onClick={() => onChange(code)}
            onKeyDown={(e) => {
              let next = -1;
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                next = (index + 1) % options.length;
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                next = (index - 1 + options.length) % options.length;
              } else {
                return;
              }
              e.preventDefault();
              onChange(options[next]);
              buttonRefs.current[next]?.focus();
            }}
            className={cn(
              "flex h-11 flex-1 cursor-pointer items-center justify-center rounded-md border text-sm font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
              checked
                ? "border-accent bg-accent text-white"
                : "border-border text-text hover:bg-border/60",
            )}
          >
            {currencyMeta(code).symbol}
          </button>
        );
      })}
    </div>
  );
}
