import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SegmentOption<T extends string> = { value: T; label: ReactNode };

type SegmentProps<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  tone?: "text" | "symbol";
  surface?: "page" | "line";
  disabled?: boolean;
  className?: string;
};

export function Segment<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  tone = "text",
  surface = "page",
  disabled = false,
  className,
}: SegmentProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "grid auto-cols-fr grid-flow-col gap-1 rounded-field p-1 has-disabled:opacity-50",
        surface === "line" ? "bg-line" : "bg-page",
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
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-10 cursor-pointer rounded-[10px] tabular-nums hover-seg disabled:cursor-not-allowed",
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
