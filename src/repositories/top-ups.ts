import { and, desc, eq, getTableColumns } from "drizzle-orm";
import { db } from "@/db";
import { accounts, topUps } from "@/db/schema";
import type { CurrencyCode } from "@/lib/currency";
import { isForeignKeyViolation } from "@/lib/db-errors";
import { isAllowedEntryDate } from "@/lib/fx/provider";
import type { SpaceId } from "@/lib/space-id";
import type { TopUpInput, TopUpPatch } from "@/lib/top-ups";
import { accountsOfSpace } from "./accounts";

export type TopUp = typeof topUps.$inferSelect;
export type TopUpWithCurrency = TopUp & { currency: CurrencyCode };

type CreateTopUpResult =
  | { ok: true; topUp: TopUp }
  | { ok: false; reason: "account_not_found" | "future_date" };

type UpdateTopUpResult =
  | { ok: true; topUp: TopUp }
  | { ok: false; reason: "not_found" | "future_date" };

export async function listTopUps(
  spaceId: SpaceId,
  accountId: string,
): Promise<TopUpWithCurrency[]> {
  return db
    .select({ ...getTableColumns(topUps), currency: accounts.currency })
    .from(topUps)
    .innerJoin(
      accounts,
      and(eq(accounts.id, topUps.accountId), eq(accounts.spaceId, topUps.spaceId)),
    )
    .where(and(eq(topUps.spaceId, spaceId), eq(topUps.accountId, accountId)))
    .orderBy(desc(topUps.occurredOn), desc(topUps.createdAt));
}

export async function getTopUp(spaceId: SpaceId, id: string): Promise<TopUp | null> {
  const [row] = await db
    .select()
    .from(topUps)
    .where(and(eq(topUps.id, id), eq(topUps.spaceId, spaceId)))
    .limit(1);
  return row ?? null;
}

export async function createTopUp(
  spaceId: SpaceId,
  userId: string,
  input: TopUpInput,
): Promise<CreateTopUpResult> {
  if (!isAllowedEntryDate(input.occurredOn)) return { ok: false, reason: "future_date" };
  const [account] = await accountsOfSpace(db, spaceId, [input.accountId]);
  if (!account) return { ok: false, reason: "account_not_found" };

  try {
    const [topUp] = await db
      .insert(topUps)
      .values({
        spaceId,
        accountId: input.accountId,
        createdBy: userId,
        amountMinor: input.amountMinor,
        note: input.note,
        occurredOn: input.occurredOn,
      })
      .returning();
    return { ok: true, topUp };
  } catch (err) {
    if (isForeignKeyViolation(err)) return { ok: false, reason: "account_not_found" };
    throw err;
  }
}

export async function updateTopUp(
  spaceId: SpaceId,
  id: string,
  patch: TopUpPatch,
): Promise<UpdateTopUpResult> {
  const { amountMinor, note, occurredOn } = patch;
  if (occurredOn !== undefined && !isAllowedEntryDate(occurredOn)) {
    return { ok: false, reason: "future_date" };
  }

  const [topUp] =
    amountMinor === undefined && note === undefined && occurredOn === undefined
      ? [await getTopUp(spaceId, id)]
      : await db
          .update(topUps)
          .set({ amountMinor, note, occurredOn })
          .where(and(eq(topUps.id, id), eq(topUps.spaceId, spaceId)))
          .returning();
  return topUp ? { ok: true, topUp } : { ok: false, reason: "not_found" };
}

export async function deleteTopUp(
  spaceId: SpaceId,
  id: string,
): Promise<{ ok: boolean }> {
  const deleted = await db
    .delete(topUps)
    .where(and(eq(topUps.id, id), eq(topUps.spaceId, spaceId)))
    .returning({ id: topUps.id });
  return { ok: deleted.length > 0 };
}
