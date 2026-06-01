"use client";

import { useRouter } from "next/navigation";
import { RANGE_PRESETS, type DateRange } from "@/lib/dates";
import { Field } from "@/components/ui/field";
import { TextInput } from "@/components/ui/text-input";

export function HistoryFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();

  function apply(range: DateRange) {
    if (!range.from || !range.to) return;
    router.push(`/history?from=${range.from}&to=${range.to}`);
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
            onChange={(e) => {
              if (e.target.value) apply({ from: e.target.value, to });
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
            onChange={(e) => {
              if (e.target.value) apply({ from, to: e.target.value });
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
            className="inline-flex min-h-11 cursor-pointer items-center rounded-pill border border-border px-4 text-sm text-text transition-colors hover:bg-surface-raised"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
