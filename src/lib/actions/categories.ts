"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dal";
import {
  CategoryInput,
  CategoryPatch,
  createCategory,
  deleteCategory,
  updateCategory,
  type Category,
} from "@/repositories/categories";
import type { ActionResult } from "./types";

// Server actions are reachable via direct POST (Next.js docs: "Mutating Data" —
// always verify auth inside every action), so each one starts with
// requireSession() and re-validates input server-side. Never trust the client.

// Postgres unique-violation (the per-user category name index).
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

function revalidateCategoryViews(): void {
  revalidatePath("/"); // home: category Select
  revalidatePath("/settings"); // settings: category list
}

export async function createCategoryAction(
  input: unknown,
): Promise<ActionResult<Category>> {
  const { user } = await requireSession();
  const parsed = CategoryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Проверьте поля формы" };

  try {
    const category = await createCategory(user.id, parsed.data);
    revalidateCategoryViews();
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
  const { user } = await requireSession();
  if (!z.uuid().safeParse(id).success) {
    return { ok: false, error: "Категория не найдена" };
  }
  const parsed = CategoryPatch.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Проверьте поля формы" };

  try {
    const category = await updateCategory(user.id, id, parsed.data);
    if (!category) return { ok: false, error: "Категория не найдена" };
    revalidateCategoryViews();
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
  const { user } = await requireSession();
  if (!z.uuid().safeParse(id).success) {
    return { ok: false, error: "Категория не найдена" };
  }
  const result = await deleteCategory(user.id, id);
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.reason === "has_expenses"
          ? "Сначала удалите или перенесите траты этой категории"
          : "Категория не найдена",
    };
  }
  revalidateCategoryViews();
  return { ok: true, data: { id } };
}
