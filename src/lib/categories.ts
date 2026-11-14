// Category form schemas. Deliberately DB-free so client components (the inline
// "create category" form) can import it without dragging the Postgres client
// into the browser bundle. The repository (@/repositories/categories)
// re-exports these for server code.

import { z } from "zod";
import { PALETTE_COLORS } from "@/lib/palette";

// Max length for a category name — shared by the schema and the create form so
// the bound lives in one place (the form reuses it for validation + maxLength).
export const CATEGORY_NAME_MAX = 40;

// Single source of truth shared by the create form (react-hook-form + zod) and
// the repository.
export const CategoryInput = z.object({
  name: z.string().trim().min(1).max(CATEGORY_NAME_MAX),
  color: z.enum(PALETTE_COLORS),
});
export type CategoryInput = z.infer<typeof CategoryInput>;

export const CategoryPatch = CategoryInput.partial();
export type CategoryPatch = z.infer<typeof CategoryPatch>;
