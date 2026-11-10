import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import type { AccountInput, AccountPatch } from "@/lib/accounts";
import type { SpaceId } from "@/lib/space-id";

export type Account = typeof accounts.$inferSelect;
export type AccountWithBalance = Account & { balanceMinor: number };

const withBalance = (a: Account): AccountWithBalance => ({
  ...a,
  balanceMinor: a.anchorAmountMinor,
});

export async function listAccounts(spaceId: SpaceId): Promise<AccountWithBalance[]> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.spaceId, spaceId))
    .orderBy(asc(accounts.createdAt), asc(accounts.id));
  return rows.map(withBalance);
}

export async function getAccount(
  spaceId: SpaceId,
  id: string,
): Promise<AccountWithBalance | null> {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.spaceId, spaceId)));
  return row ? withBalance(row) : null;
}

export async function createAccount(
  spaceId: SpaceId,
  userId: string,
  input: AccountInput,
): Promise<AccountWithBalance> {
  const [row] = await db
    .insert(accounts)
    .values({
      spaceId,
      createdBy: userId,
      name: input.name,
      currency: input.currency,
      anchorAmountMinor: input.balanceMinor,
    })
    .returning();
  return withBalance(row);
}

export async function updateAccount(
  spaceId: SpaceId,
  id: string,
  patch: AccountPatch,
): Promise<AccountWithBalance | null> {
  const result = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, id), eq(accounts.spaceId, spaceId)))
      .for("update");
    if (!locked) return null;

    const reanchor =
      patch.balanceMinor !== undefined &&
      patch.balanceMinor !== patch.loadedBalanceMinor;
    const [row] = await tx
      .update(accounts)
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(reanchor && {
          anchorAmountMinor: patch.balanceMinor,
          anchorAt: sql`now()`,
        }),
        updatedAt: sql`now()`,
      })
      .where(eq(accounts.id, id))
      .returning();
    return { row: withBalance(row), reanchor };
  });
  if (result?.reanchor) console.info("account.reanchored", { accountId: id, spaceId });
  return result?.row ?? null;
}

export async function deleteAccount(
  spaceId: SpaceId,
  id: string,
): Promise<{ ok: boolean }> {
  const rows = await db
    .delete(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.spaceId, spaceId)))
    .returning({ id: accounts.id });
  return { ok: rows.length > 0 };
}
