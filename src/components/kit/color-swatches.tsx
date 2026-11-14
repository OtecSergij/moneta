"use client";

import { RadioGroup } from "radix-ui";
import {
  PALETTE_COLORS,
  PALETTE_COLOR_NAMES,
  type PaletteColor,
} from "@/lib/palette";
import { cn } from "@/lib/utils";

const SIZES = {
  panel: { grid: "gap-0.5", item: "size-11", dot: "size-7", ring: "var(--color-page)" },
  sheet: { grid: "gap-y-1", item: "size-13", dot: "size-8", ring: "var(--color-card)" },
} as const;

export function ColorSwatches({
  value,
  onChange,
  size,
  disabled = false,
}: {
  value: PaletteColor;
  onChange: (color: PaletteColor) => void;
  size: keyof typeof SIZES;
  disabled?: boolean;
}) {
  const s = SIZES[size];
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as PaletteColor)}
      disabled={disabled}
      aria-label="Цвет"
      className={cn("grid grid-cols-5 justify-items-center", s.grid)}
    >
      {PALETTE_COLORS.map((color) => (
        <RadioGroup.Item
          key={color}
          value={color}
          aria-label={PALETTE_COLOR_NAMES[color]}
          className={cn(
            "flex cursor-pointer items-center justify-center rounded-chip hover-swatch",
            "focus-visible:outline-2 focus-visible:outline-primary",
            "disabled:cursor-not-allowed disabled:opacity-50",
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
