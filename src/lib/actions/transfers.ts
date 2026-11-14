"use server";

import { requireSpace, userNow } from "@/lib/dal";
import { todayISO } from "@/lib/dates";
import { TransferAmountPatch, TransferInput } from "@/lib/transfers";
import {
  createTransfer,
  deleteTransfer,
  updateTransferAmount,
} from "@/repositories/transfers";
import { deleteEntry, entryGone } from "./entry-gone";
import { fillRatesAfterWrite } from "./entry-rates";
import { revalidateFor } from "./revalidate";
import {
  ACCOUNT_NOT_FOUND,
  INVALID,
  isUuid,
  type ActionResultWithNotFound,
} from "./types";

const TRANSFER_NOT_FOUND = { ok: false, error: "Перевод не найден" } as const;
const TARGET_NOT_FOUND = { ok: false, error: ACCOUNT_NOT_FOUND.error } as const;

export async function createTransferAction(
  input: unknown,
): Promise<ActionResultWithNotFound<null>> {
  const { user, spaceId } = await requireSpace();
  const parsed = TransferInput.safeParse(input);
  if (!parsed.success) return INVALID;

  const enteredOn = todayISO(await userNow());
  const result = await createTransfer(spaceId, user.id, parsed.data, enteredOn);
  if (!result.ok) {
    switch (result.reason) {
      case "account_not_found":
        return ACCOUNT_NOT_FOUND;
      case "target_not_found":
        // The source's page stays open: re-render it so the window drops the vanished account.
        revalidateFor("transfer");
        return TARGET_NOT_FOUND;
      case "credit_required":
        return INVALID;
    }
  }
  revalidateFor("transfer");
  fillRatesAfterWrite(spaceId, enteredOn);
  return { ok: true, data: null };
}

export async function updateTransferAction(
  accountId: string,
  id: string,
  patch: unknown,
): Promise<ActionResultWithNotFound<null>> {
  const { spaceId } = await requireSpace();
  if (!isUuid(accountId)) return ACCOUNT_NOT_FOUND;
  if (!isUuid(id)) return TRANSFER_NOT_FOUND;
  const parsed = TransferAmountPatch.safeParse(patch);
  if (!parsed.success) return INVALID;

  const result = await updateTransferAmount(spaceId, id, accountId, parsed.data.amountMinor);
  if (!result.ok) return await entryGone(spaceId, accountId, "transfer", TRANSFER_NOT_FOUND);
  revalidateFor("transfer");
  return { ok: true, data: null };
}

export async function deleteTransferAction(
  accountId: string,
  id: string,
): Promise<ActionResultWithNotFound<null>> {
  return deleteEntry(accountId, id, "transfer", TRANSFER_NOT_FOUND, (spaceId) =>
    deleteTransfer(spaceId, id, accountId),
  );
}
