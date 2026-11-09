"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireSession } from "@/lib/dal";
import {
  ExpenseInput,
  ExpensePatch,
  createExpense,
  deleteExpense,
  updateExpense,
  type Expense,
} from "@/repositories/expenses";
import { ensureRates, syncUserRates } from "@/repositories/fx-rates";
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

  // Repo returns null for any rejected write: an unowned category or an
  // out-of-range date. The form prevents both, so a single message covers the
  // direct-POST case without claiming a cause that may be wrong.
  const expense = await createExpense(user.id, parsed.data);
  if (!expense) {
    return { ok: false, error: "Не удалось сохранить трату. Проверьте категорию и дату" };
  }
  revalidateExpenseViews();
  // Snapshot top-up after the response, so a save never waits on a provider.
  // `user.id` is read here, not inside the callback: after() runs outside the
  // request context.
  const userId = user.id;
  after(async () => {
    await ensureRates(parsed.data.spentAt);
    // Unthrottled: this path knows state just changed, so it must converge
    // now rather than wait out the page path's quiet window.
    await syncUserRates(userId);
  });
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
  // The patch may not touch spentAt at all — skip the top-up rather than
  // guessing which date to fill (see createExpenseAction for the userId
  // capture).
  const { spentAt } = parsed.data;
  const userId = user.id;
  after(async () => {
    if (spentAt !== undefined) await ensureRates(spentAt);
    await syncUserRates(userId);
  });
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
