"use client";

import { useRouter } from "next/navigation";
import { RANGE_PRESETS, sinceLastSalary, type DateRange } from "@/lib/dates";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";

const PILL_CLASS =
  "inline-flex min-h-11 cursor-pointer items-center rounded-pill border border-border px-4 text-sm text-text transition-colors hover:bg-border/60";

export function HistoryFilter({
  from,
  to,
  salaryDays,
}: {
  from: string;
  to: string;
  salaryDays: number[];
}) {
  const router = useRouter();

  function apply(range: DateRange) {
    if (!range.from || !range.to) return;
    router.push(`/history?from=${range.from}&to=${range.to}`);
  }

  // Apply only when a field is committed (blur / Enter), never on every
  // keystroke: navigating mid-edit changes the URL, which flips key={from-…}
  // and remounts the input, stealing focus — so you can't finish typing a year.
  // A native date input reports "" while the date is incomplete, so partial
  // input is ignored here; the equality guard skips redundant navigations.
  function commit(next: DateRange) {
    if (!next.from || !next.to) return;
    if (next.from === from && next.to === to) return;
    apply(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="От" htmlFor="from">
          <TextInput
            key={`from-${from}`}
            id="from"
            type="date"
            defaultValue={from}
            max={to}
            onBlur={(e) => commit({ from: e.target.value, to })}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </Field>
        <Field label="До" htmlFor="to">
          <TextInput
            key={`to-${to}`}
            id="to"
            type="date"
            defaultValue={to}
            min={from}
            onBlur={(e) => commit({ from, to: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => apply(preset.range())}
            className={PILL_CLASS}
          >
            {preset.label}
          </button>
        ))}
        {salaryDays.length > 0 ? (
          <button
            type="button"
            onClick={() => apply(sinceLastSalary(salaryDays))}
            className={PILL_CLASS}
          >
            С последней зарплаты
          </button>
        ) : null}
      </div>
    </div>
  );
}
