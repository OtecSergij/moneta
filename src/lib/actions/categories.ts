"use server";

import { z } from "zod";
import { requireSpace } from "@/lib/dal";
import { isUniqueViolation } from "@/lib/db-errors";
import {
  CategoryInput,
  CategoryPatch,
  createCategory,
  deleteCategory,
  updateCategory,
  type Category,
} from "@/repositories/categories";
import { revalidateFor } from "./revalidate";
import type { ActionResult } from "./types";

// Server actions are reachable via direct POST (Next.js docs: "Mutating Data" —
// always verify auth inside every action), so each one starts with
// requireSpace() and re-validates input server-side. Never trust the client.

export async function createCategoryAction(
  input: unknown,
): Promise<ActionResult<Category>> {
  const { user, spaceId } = await requireSpace();
  const parsed = CategoryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Проверьте поля формы" };

  try {
    const category = await createCategory(spaceId, user.id, parsed.data);
    revalidateFor("category");
    return { ok: true, data: category };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "Категория с таким именем уже есть" };
    }
    throw err;
  }
}

export async function updateCategoryAction(
  id: string,
  patch: unknown,
): Promise<ActionResult<Category>> {
  const { spaceId } = await requireSpace();
  if (!z.uuid().safeParse(id).success) {
    return { ok: false, error: "Категория не найдена" };
  }
  const parsed = CategoryPatch.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Проверьте поля формы" };

  try {
    const category = await updateCategory(spaceId, id, parsed.data);
    if (!category) return { ok: false, error: "Категория не найдена" };
    revalidateFor("category");
    return { ok: true, data: category };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "Категория с таким именем уже есть" };
    }
    throw err;
  }
}

export async function deleteCategoryAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const { spaceId } = await requireSpace();
  if (!z.uuid().safeParse(id).success) {
    return { ok: false, error: "Категория не найдена" };
  }
  const result = await deleteCategory(spaceId, id);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "has_expenses"
          ? "Сначала удалите или перенесите траты этой категории"
          : "Категория не найдена",
    };
  }
  revalidateFor("category");
  return { ok: true, data: { id } };
}
