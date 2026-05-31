// Category colour palette + form schemas. Deliberately DB-free so client
// components (the colour picker, the inline "create category" form) can import
// it without dragging the Postgres client into the browser bundle. The
// repository (@/repositories/categories) re-exports these for server code.

import { z } from "zod";

// 15-colour palette from design-system/moneta/MASTER.md "Category colours".
// Keep in sync with the picker UI.
export const CATEGORY_COLORS = [
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

export type CategoryColor = (typeof CATEGORY_COLORS)[number];

// Human-readable colour names for screen readers (the picker is otherwise just
// swatches). Keyed by hex so it stays in sync with CATEGORY_COLORS.
export const CATEGORY_COLOR_NAMES: Record<CategoryColor, string> = {
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

// Default selection in the colour picker — named, not a magic palette index.
export const DEFAULT_CATEGORY_COLOR: CategoryColor = "#3B82F6"; // Blue

// Max length for a category name — shared by the schema and the create form so
// the bound lives in one place (the form reuses it for validation + maxLength).
export const CATEGORY_NAME_MAX = 40;

// Single source of truth shared by the create form (react-hook-form + zod) and
// the repository.
export const CategoryInput = z.object({
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
  // .optional() outermost so the inferred key is optional (`description?`), not
  // a required key valued `string | undefined`.
  description: z
    .string()
    .max(250)
    .transform((v) => (v.trim().length > 0 ? v : undefined))
    .optional(),
  color: z.enum(CATEGORY_COLORS),
});
export type CategoryInput = z.infer<typeof CategoryInput>;

export const CategoryPatch = CategoryInput.partial();
export type CategoryPatch = z.infer<typeof CategoryPatch>;
