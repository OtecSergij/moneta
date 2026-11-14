export const PALETTE_COLORS = [
  "#EF4444", // Red
  "#F97316", // Orange
  "#F59E0B", // Amber
  "#EAB308", // Yellow
  "#84CC16", // Lime
  "#10B981", // Green
  "#14B8A6", // Teal
  "#06B6D4", // Cyan
  "#3B82F6", // Blue
  "#6366F1", // Indigo
  "#8B5CF6", // Violet
  "#EC4899", // Pink
  "#F43F5E", // Rose
  "#A16207", // Brown
  "#64748B", // Slate
] as const;

export type PaletteColor = (typeof PALETTE_COLORS)[number];

// Screen-reader names: the picker is otherwise just swatches.
export const PALETTE_COLOR_NAMES: Record<PaletteColor, string> = {
  "#EF4444": "Красный",
  "#F97316": "Оранжевый",
  "#F59E0B": "Янтарный",
  "#EAB308": "Жёлтый",
  "#84CC16": "Лаймовый",
  "#10B981": "Зелёный",
  "#14B8A6": "Бирюзовый",
  "#06B6D4": "Голубой",
  "#3B82F6": "Синий",
  "#6366F1": "Индиго",
  "#8B5CF6": "Фиолетовый",
  "#EC4899": "Розовый",
  "#F43F5E": "Малиновый",
  "#A16207": "Коричневый",
  "#64748B": "Серый",
};

export const DEFAULT_PALETTE_COLOR: PaletteColor = "#3B82F6";

function isPaletteColor(value: string): value is PaletteColor {
  return (PALETTE_COLORS as readonly string[]).includes(value);
}

export function toPaletteColor(
  color: string,
  fallback: PaletteColor = DEFAULT_PALETTE_COLOR,
): PaletteColor {
  return isPaletteColor(color) ? color : fallback;
}

export function firstFreeColor(usedColors: string[]): PaletteColor {
  const used = new Set(usedColors.map((c) => c.toUpperCase()));
  return PALETTE_COLORS.find((c) => !used.has(c)) ?? DEFAULT_PALETTE_COLOR;
}
