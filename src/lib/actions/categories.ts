"use server";

import { requireSpace } from "@/lib/dal";
import { isUniqueViolation } from "@/lib/db-errors";
import {
  CategoryInput,
  CategoryPatch,
  createCategory,
  deleteCategory,
  updateCategory,
  type Category,
  type ExpenseCategory,
} from "@/repositories/categories";
import { revalidateFor } from "./revalidate";
import { INVALID, isUuid, type ActionResult, type ActionResultWithNotFound } from "./types";

const NOT_FOUND = { ok: false, error: "Категория не найдена", notFound: true } as const;

function toExpenseCategory({ id, name, color }: Category): ExpenseCategory {
  return { id, name, color };
}

// Server actions are reachable via direct POST (Next.js docs: "Mutating Data" —
// always verify auth inside every action), so each one starts with
// requireSpace() and re-validates input server-side. Never trust the client.

export async function createCategoryAction(
  input: unknown,
): Promise<ActionResult<ExpenseCategory>> {
  const { user, spaceId } = await requireSpace();
  const parsed = CategoryInput.safeParse(input);
  if (!parsed.success) return INVALID;

  try {
    const category = await createCategory(spaceId, user.id, parsed.data);
    revalidateFor("category");
    return { ok: true, data: toExpenseCategory(category) };
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
): Promise<ActionResultWithNotFound<ExpenseCategory>> {
  const { spaceId } = await requireSpace();
  if (!isUuid(id)) return NOT_FOUND;
  const parsed = CategoryPatch.safeParse(patch);
  if (!parsed.success) return INVALID;

  try {
    const category = await updateCategory(spaceId, id, parsed.data);
    revalidateFor("category");
    if (!category) return NOT_FOUND;
    return { ok: true, data: toExpenseCategory(category) };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { ok: false, error: "Категория с таким именем уже есть" };
    }
    throw err;
  }
}

export async function deleteCategoryAction(
  id: string,
): Promise<ActionResultWithNotFound<null>> {
  const { spaceId } = await requireSpace();
  if (!isUuid(id)) return NOT_FOUND;
  const result = await deleteCategory(spaceId, id);
  if (!result.ok) {
    if (result.reason === "has_expenses") {
      return { ok: false, error: "Сначала удалите или перенесите траты этой категории" };
    }
    revalidateFor("category");
    return NOT_FOUND;
  }
  revalidateFor("category");
  return { ok: true, data: null };
}
