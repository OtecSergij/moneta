import { requireSpace } from "@/lib/dal";
import type { SpaceId } from "@/lib/space-id";
import { getAccount } from "@/repositories/accounts";
import { revalidateFor, type RevalidateEvent } from "./revalidate";
import { ACCOUNT_NOT_FOUND, isUuid } from "./types";

// A missing entry on an account that still exists is not a reason to leave
// the account page: revalidate so the stale row drops out, and keep the user there.
export async function entryGone<R>(
  spaceId: SpaceId,
  accountId: string | undefined,
  event: RevalidateEvent,
  gone: R,
): Promise<R | typeof ACCOUNT_NOT_FOUND> {
  if (accountId !== undefined && !(await getAccount(spaceId, accountId))) {
    return ACCOUNT_NOT_FOUND;
  }
  revalidateFor(event);
  return gone;
}

// Deleting an entry from its account's page: `gone` answers a missing entry.
export async function deleteEntry<R>(
  accountId: string,
  id: string,
  event: RevalidateEvent,
  gone: R,
  remove: (spaceId: SpaceId) => Promise<{ ok: boolean }>,
): Promise<{ ok: true; data: null } | R | typeof ACCOUNT_NOT_FOUND> {
  const { spaceId } = await requireSpace();
  if (!isUuid(accountId)) return ACCOUNT_NOT_FOUND;
  if (!isUuid(id)) return gone;
  const result = await remove(spaceId);
  if (!result.ok) return entryGone(spaceId, accountId, event, gone);
  revalidateFor(event);
  return { ok: true, data: null };
}
