"use client";

import { useRef, useSyncExternalStore } from "react";
import { subDays } from "date-fns";
import { Calendar } from "lucide-react";
import { formatChipDate, toISODate, todayISO } from "@/lib/dates";
import { Chip } from "@/components/kit/chip";

export function DateChips({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (iso: string) => void;
  error?: string;
}) {
  const pickerRef = useRef<HTMLInputElement | null>(null);
  // "Today" is the user's local date; the server clock may sit in another
  // timezone, so nothing is marked pressed until hydration is over.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const today = todayISO();
  const yesterday = toISODate(subDays(new Date(), 1));
  const custom =
    mounted && value !== "" && value !== today && value !== yesterday;

  function openPicker() {
    const input = pickerRef.current;
    if (!input) return;
    input.max = todayISO();
    try {
      input.showPicker();
    } catch {
      input.focus();
      input.click();
    }
  }

  return (
    <fieldset className="relative m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">Дата</legend>
      <div className="flex flex-wrap items-center gap-2">
        <Chip pressed={mounted && value === today} onClick={() => onChange(today)}>
          Сегодня
        </Chip>
        <Chip pressed={mounted && value === yesterday} onClick={() => onChange(yesterday)}>
          Вчера
        </Chip>
        <Chip
          pressed={custom}
          icon={<Calendar className="size-4" strokeWidth={1.75} />}
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
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="pointer-events-none absolute bottom-0 left-0 size-px opacity-0"
      />
      {error ? (
        <p className="mt-1.5 text-[13px] text-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
