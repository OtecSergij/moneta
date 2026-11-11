"use client";

import { useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { toast } from "sonner";
import {
  CURRENCY_CODES,
  currencyMeta,
  type CurrencyCode,
} from "@/lib/currency";
import { setDisplayCurrencyAction } from "@/lib/actions/display-currency";
import { cn } from "@/lib/utils";

const MENU_LABEL = "Валюта отображения";

export function DisplayCurrencyChip({
  initialCurrency,
}: {
  initialCurrency: CurrencyCode;
}) {
  const [value, setValue] = useState(initialCurrency);
  const [seenCurrency, setSeenCurrency] = useState(initialCurrency);
  if (seenCurrency !== initialCurrency) {
    setSeenCurrency(initialCurrency);
    setValue(initialCurrency);
  }
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  // Radix opens the menu on pointerdown for every pointer type; on a phone
  // that fires at the start of a scroll gesture, so touch opens on click.
  const touchPress = useRef(false);

  function select(next: CurrencyCode) {
    if (next === value) return;

    const previous = value;
    setValue(next);
    startTransition(async () => {
      try {
        const res = await setDisplayCurrencyAction(next);
        if (res.ok) return;
        toast.error(res.error);
      } catch (error) {
        unstable_rethrow(error);
        toast.error("Не удалось сохранить");
      }
      setValue(previous);
    });
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger
        aria-label={`${MENU_LABEL}: ${value}`}
        onPointerDown={(e) => {
          touchPress.current = e.pointerType !== "mouse";
          if (touchPress.current) e.preventDefault();
        }}
        onClick={() => {
          if (!touchPress.current) return;
          touchPress.current = false;
          setOpen((o) => !o);
        }}
        className="group flex h-11 cursor-pointer items-center gap-1.5 rounded-chip bg-card pr-3 pl-4 text-sm font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover-outline focus-visible:outline-2 focus-visible:outline-primary data-[state=open]:shadow-[inset_0_0_0_1px_var(--color-bar-past)]"
      >
        {value}
        <ChevronDown
          aria-hidden
          className="size-4 group-data-[state=open]:rotate-180"
          strokeWidth={1.75}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          collisionPadding={8}
          aria-label={MENU_LABEL}
          aria-labelledby={undefined}
          className="z-50 flex w-[232px] flex-col rounded-[20px] bg-card p-1.5 text-ink shadow-menu outline-none"
        >
          <DropdownMenu.RadioGroup
            value={value}
            onValueChange={(next) => select(next as CurrencyCode)}
          >
            {CURRENCY_CODES.map((code) => {
              const { symbol, name } = currencyMeta(code);
              const checked = code === value;
              return (
                <DropdownMenu.RadioItem
                  key={code}
                  value={code}
                  textValue={name}
                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[14px] px-2.5 py-2 hover-row focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-8 flex-none items-center justify-center rounded-[9px] font-semibold",
                      symbol.length > 1 ? "text-[10px]" : "text-base",
                      checked
                        ? "bg-primary-soft text-primary-ink"
                        : "bg-page text-ink-badge",
                    )}
                  >
                    {symbol}
                  </span>
                  <span className="flex-1 text-[15px] font-medium">{name}</span>
                  <DropdownMenu.ItemIndicator>
                    <Check
                      aria-hidden
                      className="size-5 text-primary"
                      strokeWidth={2.25}
                    />
                  </DropdownMenu.ItemIndicator>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
