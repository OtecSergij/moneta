"use client";

import { RadioGroup } from "radix-ui";
import { Check } from "lucide-react";
import {
  CATEGORY_COLORS,
  CATEGORY_COLOR_NAMES,
  type CategoryColor,
} from "@/lib/categories";
import { cn } from "@/lib/utils";

export function ColorSwatches({
  value,
  onChange,
}: {
  value: CategoryColor;
  onChange: (color: CategoryColor) => void;
}) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onChange(v as CategoryColor)}
      aria-label="Цвет категории"
      className="flex flex-wrap gap-2"
    >
      {CATEGORY_COLORS.map((color) => (
        <RadioGroup.Item
          key={color}
          value={color}
          aria-label={CATEGORY_COLOR_NAMES[color]}
          style={{ backgroundColor: color }}
          className={cn(
            "flex size-7 cursor-pointer items-center justify-center rounded-full",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            "data-[state=checked]:ring-2 data-[state=checked]:ring-text data-[state=checked]:ring-offset-2 data-[state=checked]:ring-offset-surface-raised",
          )}
        >
          <RadioGroup.Indicator>
            <Check className="size-4 text-white" />
          </RadioGroup.Indicator>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
