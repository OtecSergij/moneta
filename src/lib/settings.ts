// User-settings schemas. Deliberately DB-free so the settings form (the day
// grid) can import the bounds without dragging the Postgres client into the
// browser bundle. The repository (@/repositories/user-settings) re-exports
// these for server code — mirrors @/lib/categories.

import { z } from "zod";

// Salary days are calendar days of the month. A user can have several (e.g. the
// 3rd and the 17th). The bound lives here so the grid and the schema agree.
export const SALARY_DAY_MIN = 1;
export const SALARY_DAY_MAX = 31;

// Normalises any client payload to a sorted, de-duplicated list of in-range
// days. Empty list is valid and means "not configured".
export const SalaryDaysInput = z
  .array(z.number().int().min(SALARY_DAY_MIN).max(SALARY_DAY_MAX))
  .max(SALARY_DAY_MAX)
  .transform((days) => Array.from(new Set(days)).sort((a, b) => a - b));
export type SalaryDaysInput = z.infer<typeof SalaryDaysInput>;
