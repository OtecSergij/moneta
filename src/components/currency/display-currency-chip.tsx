"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import type { CurrencyCode } from "@/lib/currency";
import { setDisplayCurrencyAction } from "@/lib/actions/display-currency";
import { CurrencySheet } from "@/components/currency/currency-sheet";

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
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function select(next: CurrencyCode) {
    setOpen(false);
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
    <>
      <button
        type="button"
        aria-label={`Валюта отображения: ${value}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex h-11 cursor-pointer items-center gap-1.5 rounded-chip bg-card pr-3 pl-4 text-sm font-semibold text-ink shadow-[inset_0_0_0_1px_var(--color-line)] focus-visible:outline-2 focus-visible:outline-primary"
      >
        {value}
        <ChevronDown aria-hidden className="size-4" strokeWidth={1.75} />
      </button>
      <CurrencySheet
        open={open}
        onOpenChange={setOpen}
        value={value}
        onSelect={select}
      />
    </>
  );
}
