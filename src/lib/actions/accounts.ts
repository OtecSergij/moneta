"use server";

import { RedirectType, redirect } from "next/navigation";
import { AccountInput, AccountPatch } from "@/lib/accounts";
import { requireSpace } from "@/lib/dal";
import { isUniqueViolation } from "@/lib/db-errors";
import {
  createAccount,
  deleteAccount,
  updateAccount,
} from "@/repositories/accounts";
import { revalidateFor } from "./revalidate";
import {
  ACCOUNT_NOT_FOUND,
  INVALID,
  isUuid,
  type ActionResult,
  type ActionResultWithNotFound,
} from "./types";

const DUPLICATE = { ok: false, error: "Счёт с таким названием уже есть" } as const;

export async function createAccountAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  const parsed = AccountInput.safeParse(input);
  if (!parsed.success) return INVALID;
  try {
    await createAccount(spaceId, user.id, parsed.data);
    revalidateFor("account");
    return { ok: true, data: null };
  } catch (err) {
    if (isUniqueViolation(err)) return DUPLICATE;
    throw err;
  }
}

export async function updateAccountAction(
  id: string,
  patch: unknown,
): Promise<ActionResultWithNotFound<null>> {
  const { spaceId } = await requireSpace();
  if (!isUuid(id)) return ACCOUNT_NOT_FOUND;
  const parsed = AccountPatch.safeParse(patch);
  if (!parsed.success) return INVALID;
  try {
    const account = await updateAccount(spaceId, id, parsed.data);
    if (!account) return ACCOUNT_NOT_FOUND;
    revalidateFor("account");
    return { ok: true, data: null };
  } catch (err) {
    if (isUniqueViolation(err)) return DUPLICATE;
    throw err;
  }
}

export async function deleteAccountAction(
  id: string,
): Promise<ActionResultWithNotFound<null>> {
  const { spaceId } = await requireSpace();
  if (!isUuid(id)) return ACCOUNT_NOT_FOUND;
  const result = await deleteAccount(spaceId, id);
  if (!result.ok && result.reason === "not_found") return ACCOUNT_NOT_FOUND;
  revalidateFor("account");
  if (!result.ok) {
    return { ok: false, error: "Сначала удалите или перенесите траты этого счёта" };
  }
  redirect("/accounts", RedirectType.replace);
}
