"use client";

import { RadioGroup } from "radix-ui";
import {
  CATEGORY_COLORS,
  CATEGORY_COLOR_NAMES,
  type CategoryColor,
} from "@/lib/categories";
import { cn } from "@/lib/utils";

const SIZES = {
  panel: { grid: "gap-0.5", item: "size-11", dot: "size-7", ring: "var(--color-page)" },
  sheet: { grid: "gap-y-1", item: "size-13", dot: "size-8", ring: "var(--color-card)" },
} as const;

export function ColorSwatches({
  value,
  onChange,
  size,
}: {
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
  size: keyof typeof SIZES;
}) {
  const s = SIZES[size];
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as CategoryColor)}
      aria-label="Цвет"
      className={cn("grid grid-cols-5 justify-items-center", s.grid)}
    >
      {CATEGORY_COLORS.map((color) => (
        <RadioGroup.Item
          key={color}
          value={color}
          aria-label={CATEGORY_COLOR_NAMES[color]}
          className={cn(
            "flex cursor-pointer items-center justify-center rounded-chip",
            "focus-visible:outline-2 focus-visible:outline-primary",
            s.item,
          )}
        >
          <span
            aria-hidden
            className={cn("rounded-chip", s.dot)}
            style={{
              background: color,
              boxShadow:
                color === value
                  ? `0 0 0 3px ${s.ring}, 0 0 0 5px ${color}`
                  : undefined,
            }}
          />
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
