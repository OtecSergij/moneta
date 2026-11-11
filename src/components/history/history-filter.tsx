"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar } from "lucide-react";
import { RANGE_PRESETS, formatDayHeading, type DateRange } from "@/lib/dates";
import { useMounted } from "@/lib/hooks/use-mounted";
import { Chip } from "@/components/kit/chip";

export function HistoryFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  // Preset ranges are derived from "today", which only matches the server clock
  // when both sit in the same timezone — so we decide which chip is active on
  // the client using the user's local today. `mounted` is false during SSR and
  // the first hydration render, then true: that keeps the server HTML
  // highlight-free and avoids a hydration mismatch.
  const mounted = useMounted();

  function apply(range: DateRange) {
    if (range.from === from && range.to === to) return;
    startTransition(() => {
      router.push(`/history?from=${range.from}&to=${range.to}`);
    });
  }

  return (
    <section
      aria-label="Период"
      className="mx-4 mt-2 flex flex-col gap-3 rounded-card bg-card p-4"
    >
      <div className="grid grid-cols-2 gap-2">
        <DateField
          label="От"
          value={from}
          onChange={(next) => apply({ from: next, to: next > to ? next : to })}
        />
        <DateField
          label="До"
          value={to}
          min={from}
          onChange={(next) =>
            apply({ from: next < from ? next : from, to: next })
          }
        />
      </div>
      <div className="flex gap-2">
        {RANGE_PRESETS.map((preset) => {
          const range = preset.range();
          const pressed =
            mounted && range.from === from && range.to === to;
          return (
            <Chip
              key={preset.key}
              pressed={pressed}
              wide
              onClick={() => apply(range)}
            >
              {preset.label}
            </Chip>
          );
        })}
      </div>
    </section>
  );
}

function DateField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative flex h-[58px] cursor-pointer items-center justify-between gap-2 rounded-field bg-page px-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-ink-2">{label}</span>
        <span className="truncate text-[15px] font-medium tabular-nums">
          {formatDayHeading(value)}
        </span>
      </span>
      <Calendar
        aria-hidden
        className="size-[18px] shrink-0 text-ink-2"
        strokeWidth={1.75}
      />
      <input
        type="date"
        aria-label={label}
        value={value}
        min={min}
        required
        onClick={(e) => {
          try {
            e.currentTarget.showPicker();
          } catch {
            // The click already lands on the native input, which opens its own picker.
          }
        }}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  );
}
