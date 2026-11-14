"use client";

import { useRef } from "react";
import { subDays } from "date-fns";
import { Calendar } from "lucide-react";
import { formatChipDate, minEntryDate, toISODate, todayISO } from "@/lib/dates";
import { useMounted } from "@/lib/hooks/use-mounted";
import { Chip, ChipGroup } from "@/components/kit/chip";

export function DateChips({
  value,
  onChange,
  error,
  disabled = false,
}: {
  value: string;
  onChange: (iso: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const pickerRef = useRef<HTMLInputElement | null>(null);
  // "Today" is the user's local date; the server clock may sit in another
  // timezone, so nothing is marked pressed until hydration is over.
  const mounted = useMounted();
  const today = todayISO();
  const yesterday = toISODate(subDays(new Date(), 1));
  const custom =
    mounted && value !== "" && value !== today && value !== yesterday;

  function openPicker() {
    const input = pickerRef.current;
    if (!input) return;
    input.min = minEntryDate();
    input.max = todayISO();
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  }

  return (
    <ChipGroup legend="Дата" error={error} className="relative">
      <div className="flex flex-wrap items-center gap-2">
        <Chip
          pressed={mounted && value === today}
          disabled={disabled}
          onClick={() => onChange(today)}
        >
          Сегодня
        </Chip>
        <Chip
          pressed={mounted && value === yesterday}
          disabled={disabled}
          onClick={() => onChange(yesterday)}
        >
          Вчера
        </Chip>
        <Chip
          pressed={custom}
          icon={<Calendar className="size-4" strokeWidth={1.75} />}
          disabled={disabled}
          onClick={openPicker}
        >
          {custom ? formatChipDate(value) : "Другая"}
        </Chip>
      </div>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="pointer-events-none absolute bottom-0 left-0 size-px opacity-0"
      />
    </ChipGroup>
  );
}
