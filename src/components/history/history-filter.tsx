"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { RANGE_PRESETS, sinceLastSalary, type DateRange } from "@/lib/dates";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";
import { cn } from "@/lib/utils";

const PILL_BASE =
  "inline-flex min-h-11 cursor-pointer items-center rounded-pill border px-4 text-sm transition-colors";
const PILL_ACTIVE = "border-accent bg-accent text-white";
const PILL_INACTIVE = "border-border text-text hover:bg-border/60";

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

  // Preset ranges are derived from "today", which only matches the server clock
  // when both sit in the same timezone — so we decide which pill is active on
  // the client using the user's local today. `mounted` is false during SSR and
  // the first hydration render, then true: that keeps the server HTML
  // highlight-free and avoids a hydration mismatch.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  function apply(range: DateRange) {
    if (!range.from || !range.to) return;
    router.push(`/history?from=${range.from}&to=${range.to}`);
  }

  function isActive(range: DateRange): boolean {
    return mounted && range.from === from && range.to === to;
  }

  const presets = [
    ...RANGE_PRESETS.map((p) => ({
      key: p.key,
      label: p.label,
      range: p.range(),
    })),
    ...(salaryDays.length > 0
      ? [
          {
            key: "salary",
            label: "С последней зарплаты",
            range: sinceLastSalary(salaryDays),
          },
        ]
      : []),
  ];

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        {presets.map((preset) => {
          const active = isActive(preset.range);
          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (!active) apply(preset.range);
              }}
              className={cn(PILL_BASE, active ? PILL_ACTIVE : PILL_INACTIVE)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
