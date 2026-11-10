"use server";

import { AccountInput, AccountPatch } from "@/lib/accounts";
import { requireSpace } from "@/lib/dal";
import { isUniqueViolation } from "@/lib/db-errors";
import {
  createAccount,
  deleteAccount,
  updateAccount,
  type AccountWithBalance,
} from "@/repositories/accounts";
import { revalidateFor } from "./revalidate";
import { INVALID, isUuid, type ActionResult } from "./types";

const NOT_FOUND = { ok: false, error: "Счёт не найден" } as const;
const DUPLICATE = { ok: false, error: "Счёт с таким названием уже есть" } as const;

export async function createAccountAction(
  input: unknown,
): Promise<ActionResult<AccountWithBalance>> {
  const { user, spaceId } = await requireSpace();
  const parsed = AccountInput.safeParse(input);
  if (!parsed.success) return INVALID;
  try {
    const account = await createAccount(spaceId, user.id, parsed.data);
    revalidateFor("account");
    return { ok: true, data: account };
  } catch (err) {
    if (isUniqueViolation(err)) return DUPLICATE;
    throw err;
  }
}

export async function updateAccountAction(
  id: string,
  patch: unknown,
): Promise<ActionResult<AccountWithBalance>> {
  const { spaceId } = await requireSpace();
  if (!isUuid(id)) return NOT_FOUND;
  const parsed = AccountPatch.safeParse(patch);
  if (!parsed.success) return INVALID;
  try {
    const account = await updateAccount(spaceId, id, parsed.data);
    if (!account) return NOT_FOUND;
    revalidateFor("account");
    return { ok: true, data: account };
  } catch (err) {
    if (isUniqueViolation(err)) return DUPLICATE;
    throw err;
  }
}

export async function deleteAccountAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const { spaceId } = await requireSpace();
  if (!isUuid(id)) return NOT_FOUND;
  const result = await deleteAccount(spaceId, id);
  if (!result.ok) return NOT_FOUND;
  revalidateFor("account");
  return { ok: true, data: { id } };
}
