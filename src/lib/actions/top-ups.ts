"use server";

import { requireSpace } from "@/lib/dal";
import { FUTURE_DATE_ERROR } from "@/lib/dates";
import { TopUpInput, TopUpPatch } from "@/lib/top-ups";
import {
  createTopUp,
  deleteTopUp,
  updateTopUp,
} from "@/repositories/top-ups";
import { deleteEntry, entryGone } from "./entry-gone";
import { fillRatesAfterWrite } from "./entry-rates";
import { revalidateFor } from "./revalidate";
import {
  ACCOUNT_NOT_FOUND,
  INVALID,
  isUuid,
  type ActionResultWithNotFound,
} from "./types";

const TOP_UP_NOT_FOUND = { ok: false, error: "Пополнение не найдено" } as const;
const FUTURE_DATE = { ok: false, error: FUTURE_DATE_ERROR } as const;

export async function createTopUpAction(
  input: unknown,
): Promise<ActionResultWithNotFound<null>> {
  const { user, spaceId } = await requireSpace();
  const parsed = TopUpInput.safeParse(input);
  if (!parsed.success) return INVALID;

  const result = await createTopUp(spaceId, user.id, parsed.data);
  if (!result.ok) {
    return result.reason === "account_not_found" ? ACCOUNT_NOT_FOUND : FUTURE_DATE;
  }
  revalidateFor("topUp");
  fillRatesAfterWrite(spaceId, parsed.data.occurredOn);
  return { ok: true, data: null };
}

export async function updateTopUpAction(
  accountId: string,
  id: string,
  patch: unknown,
): Promise<ActionResultWithNotFound<null>> {
  const { spaceId } = await requireSpace();
  if (!isUuid(accountId)) return ACCOUNT_NOT_FOUND;
  if (!isUuid(id)) return TOP_UP_NOT_FOUND;
  const parsed = TopUpPatch.safeParse(patch);
  if (!parsed.success) return INVALID;

  const result = await updateTopUp(spaceId, id, parsed.data);
  if (!result.ok) {
    return result.reason === "future_date"
      ? FUTURE_DATE
      : await entryGone(spaceId, accountId, "topUp", TOP_UP_NOT_FOUND);
  }
  revalidateFor("topUp");
  fillRatesAfterWrite(spaceId, parsed.data.occurredOn);
  return { ok: true, data: null };
}

export async function deleteTopUpAction(
  accountId: string,
  id: string,
): Promise<ActionResultWithNotFound<null>> {
  return deleteEntry(accountId, id, "topUp", TOP_UP_NOT_FOUND, (spaceId) =>
    deleteTopUp(spaceId, id),
  );
}
