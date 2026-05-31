"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dal";
import {
  ExpenseInput,
  ExpensePatch,
  createExpense,
  deleteExpense,
  updateExpense,
  type Expense,
} from "@/repositories/expenses";
import type { ActionResult } from "./types";

// See categories.ts for the auth/validation rationale — same rules apply.

function revalidateExpenseViews(): void {
  revalidatePath("/"); // home: summary + recent list
  revalidatePath("/history"); // history: range summary + full list
}

export async function createExpenseAction(
  input: unknown,
): Promise<ActionResult<Expense>> {
  const { user } = await requireSession();
  const parsed = ExpenseInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Проверьте поля формы" };

  // Repo returns null when the category isn't owned by this user.
  const expense = await createExpense(user.id, parsed.data);
  if (!expense) return { ok: false, error: "Категория не найдена" };
  revalidateExpenseViews();
  return { ok: true, data: expense };
}

export async function updateExpenseAction(
  id: string,
  patch: unknown,
): Promise<ActionResult<Expense>> {
  const { user } = await requireSession();
  if (!z.uuid().safeParse(id).success) {
    return { ok: false, error: "Трата не найдена" };
  }
  const parsed = ExpensePatch.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Проверьте поля формы" };

  const expense = await updateExpense(user.id, id, parsed.data);
  if (!expense) return { ok: false, error: "Не удалось обновить трату" };
  revalidateExpenseViews();
  return { ok: true, data: expense };
}

export async function deleteExpenseAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireSession();
  if (!z.uuid().safeParse(id).success) {
    return { ok: false, error: "Трата не найдена" };
  }
  const result = await deleteExpense(user.id, id);
  if (!result.ok) return { ok: false, error: "Трата не найдена" };
  revalidateExpenseViews();
  return { ok: true, data: { id } };
}
