import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = { value: T; label: ReactNode };

type SegmentProps<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  tone?: "text" | "symbol";
  className?: string;
};

export function Segment<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  tone = "text",
  className,
}: SegmentProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "grid auto-cols-fr grid-flow-col gap-1 rounded-field bg-page p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-10 cursor-pointer rounded-[10px] tabular-nums hover-seg",
              tone === "symbol"
                ? "text-[15px] font-medium"
                : "text-sm font-semibold",
              "focus-visible:outline-2 focus-visible:outline-primary",
              selected ? "bg-card text-ink shadow-raised" : "text-ink-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
