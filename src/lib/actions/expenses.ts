"use server";

import { requireSpace } from "@/lib/dal";
import {
  ExpenseInput,
  ExpensePatch,
  createExpense,
  deleteExpense,
  getExpense,
  updateExpense,
} from "@/repositories/expenses";
import { entryGone } from "./entry-gone";
import { revalidateFor } from "./revalidate";
import {
  ACCOUNT_NOT_FOUND,
  INVALID,
  isUuid,
  type ActionResult,
  type ActionResultWithNotFound,
} from "./types";

const EXPENSE_NOT_FOUND = { ok: false, error: "Трата не найдена" } as const;

// See categories.ts for the auth/validation rationale — same rules apply.

export async function createExpenseAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  const parsed = ExpenseInput.safeParse(input);
  if (!parsed.success) return INVALID;

  // Repo returns null for any rejected write: an unowned category, an
  // out-of-range date, or an account of another space or currency. The form
  // prevents all three, so a single message covers the direct-POST case
  // without claiming a cause that may be wrong.
  const expense = await createExpense(spaceId, user.id, parsed.data);
  if (!expense) {
    // The account or category may have just been deleted by another member:
    // re-render so the form drops the stale selection.
    revalidateFor("expense");
    return { ok: false, error: "Не удалось сохранить трату. Проверьте категорию, дату и счёт" };
  }
  revalidateFor("expense");
  return { ok: true, data: null };
}

// `accountId` names the account whose page the call comes from: once that
// account is gone too, the answer is ACCOUNT_NOT_FOUND.
export async function updateExpenseAction(
  id: string,
  patch: unknown,
  accountId?: string,
): Promise<ActionResultWithNotFound<null>> {
  const { spaceId } = await requireSpace();
  if (accountId !== undefined && !isUuid(accountId)) return ACCOUNT_NOT_FOUND;
  if (!isUuid(id)) return EXPENSE_NOT_FOUND;
  const parsed = ExpensePatch.safeParse(patch);
  if (!parsed.success) return INVALID;

  const expense = await updateExpense(spaceId, id, parsed.data);
  if (!expense) {
    const gone = (await getExpense(spaceId, id)) === null;
    return await entryGone(
      spaceId,
      accountId,
      "expense",
      gone ? EXPENSE_NOT_FOUND : ({ ok: false, error: "Не удалось обновить трату" } as const),
    );
  }
  revalidateFor("expense");
  return { ok: true, data: null };
}

export async function deleteExpenseAction(
  id: string,
  accountId?: string,
): Promise<ActionResultWithNotFound<null>> {
  const { spaceId } = await requireSpace();
  if (accountId !== undefined && !isUuid(accountId)) return ACCOUNT_NOT_FOUND;
  if (!isUuid(id)) return EXPENSE_NOT_FOUND;
  const result = await deleteExpense(spaceId, id);
  if (!result.ok) return await entryGone(spaceId, accountId, "expense", EXPENSE_NOT_FOUND);
  revalidateFor("expense");
  return { ok: true, data: null };
}
