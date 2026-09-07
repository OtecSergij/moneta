"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Popover } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  CURRENCY_CODES,
  currencyMeta,
  type CurrencyCode,
} from "@/lib/currency";
import { setDisplayCurrencyAction } from "@/lib/actions/display-currency";
import { cn } from "@/lib/utils";

// App-wide display currency, switchable from the header on `/` and
// `/history` and from its own section on `/settings` — same component in
// all three places. Optimistic: the trigger shows the picked value right
// away and reverts on failure, the same useTransition + toast pattern the
// rest of the settings/expense forms use.
export function DisplayCurrencySwitcher({
  initialDisplayCurrency,
}: {
  initialDisplayCurrency: CurrencyCode;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialDisplayCurrency);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function select(next: CurrencyCode) {
    setOpen(false);
    if (next === value) return;

    const previous = value;
    setValue(next);
    startTransition(async () => {
      const res = await setDisplayCurrencyAction(next);
      if (!res.ok) {
        setValue(previous);
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label="Валюта отображения"
          className={cn(
            "inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-md border border-border px-3 text-sm font-medium text-text transition-colors hover:bg-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
            pending && "opacity-60",
          )}
        >
          {value}
          <ChevronDown aria-hidden="true" className="size-3.5 text-text-muted" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-52 rounded-lg border border-border bg-surface-raised p-1 shadow-lg focus:outline-none"
        >
          <div
            role="radiogroup"
            aria-label="Валюта отображения"
            className="flex flex-col"
          >
            {CURRENCY_CODES.map((code) => {
              const meta = currencyMeta(code);
              const active = code === value;
              return (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => select(code)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-left text-sm transition-colors hover:bg-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
                    active ? "font-medium text-accent" : "text-text",
                  )}
                >
                  {/* Fixed slot: RSD is far wider than ₽ / $ / € / ₿ and
                      would otherwise push the names out of alignment. */}
                  <span className="w-10 shrink-0">{meta.symbol}</span>
                  <span className="flex-1">{meta.name}</span>
                  {/* Colour alone is a weak selection cue, so the current
                      value also carries a mark. */}
                  {active ? (
                    <Check aria-hidden="true" className="size-4 shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
