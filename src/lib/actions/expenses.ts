"use server";

import { after } from "next/server";
import { requireSpace } from "@/lib/dal";
import {
  ExpenseInput,
  ExpensePatch,
  createExpense,
  deleteExpense,
  updateExpense,
  type Expense,
} from "@/repositories/expenses";
import { ensureRates, syncSpaceRates } from "@/repositories/fx-rates";
import { revalidateFor } from "./revalidate";
import { INVALID, isUuid, type ActionResult } from "./types";

// See categories.ts for the auth/validation rationale — same rules apply.

export async function createExpenseAction(
  input: unknown,
): Promise<ActionResult<Expense>> {
  const { user, spaceId } = await requireSpace();
  const parsed = ExpenseInput.safeParse(input);
  if (!parsed.success) return INVALID;

  // Repo returns null for any rejected write: an unowned category, an
  // out-of-range date, or an account of another space or currency. The form
  // prevents all three, so a single message covers the direct-POST case
  // without claiming a cause that may be wrong.
  const expense = await createExpense(spaceId, user.id, parsed.data);
  if (!expense) {
    return { ok: false, error: "Не удалось сохранить трату. Проверьте категорию, дату и счёт" };
  }
  revalidateFor("expense");
  // Snapshot top-up after the response, so a save never waits on a provider.
  // `spaceId` is read here, not inside the callback: after() runs outside the
  // request context.
  after(async () => {
    await ensureRates(parsed.data.spentAt);
    // Unthrottled: this path knows state just changed, so it must converge
    // now rather than wait out the page path's quiet window.
    await syncSpaceRates(spaceId);
  });
  return { ok: true, data: expense };
}

export async function updateExpenseAction(
  id: string,
  patch: unknown,
): Promise<ActionResult<Expense>> {
  const { spaceId } = await requireSpace();
  if (!isUuid(id)) {
    return { ok: false, error: "Трата не найдена" };
  }
  const parsed = ExpensePatch.safeParse(patch);
  if (!parsed.success) return INVALID;

  const expense = await updateExpense(spaceId, id, parsed.data);
  if (!expense) return { ok: false, error: "Не удалось обновить трату" };
  revalidateFor("expense");
  // The patch may not touch spentAt at all — skip the top-up rather than
  // guessing which date to fill.
  const { spentAt } = parsed.data;
  after(async () => {
    if (spentAt !== undefined) await ensureRates(spentAt);
    await syncSpaceRates(spaceId);
  });
  return { ok: true, data: expense };
}

export async function deleteExpenseAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const { spaceId } = await requireSpace();
  if (!isUuid(id)) {
    return { ok: false, error: "Трата не найдена" };
  }
  const result = await deleteExpense(spaceId, id);
  if (!result.ok) return { ok: false, error: "Трата не найдена" };
  revalidateFor("expense");
  return { ok: true, data: { id } };
}
