"use client";

import { useMemo } from "react";
import type { ExpenseCategory } from "@/repositories/categories";

export function useCategoryById(categories: ExpenseCategory[]): Map<string, ExpenseCategory> {
  return useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
}
