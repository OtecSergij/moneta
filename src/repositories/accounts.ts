import { and, asc, eq, getTableColumns, sql, type SQL } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import { accounts, expenses } from "@/db/schema";
import type { AccountInput, AccountPatch } from "@/lib/accounts";
import type { SpaceId } from "@/lib/space-id";

export type Account = typeof accounts.$inferSelect;
export type AccountWithBalance = Account & { balanceMinor: number; expenseCount: number };

function toSafeInteger(value: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`account balance out of range: ${value}`);
  return n;
}

async function selectWithBalance(
  executor: DbExecutor,
  where: SQL | undefined,
): Promise<AccountWithBalance[]> {
  const rows = await executor
    .select({
      ...getTableColumns(accounts),
      spentMinor: sql<string>`coalesce(sum(${expenses.amountMinor}) filter (where ${expenses.createdAt} > ${accounts.anchorAt}), 0)::bigint`,
      expenseCount: sql<number>`count(${expenses.id})::int`,
    })
    .from(accounts)
    .leftJoin(
      expenses,
      and(eq(expenses.accountId, accounts.id), eq(expenses.spaceId, accounts.spaceId)),
    )
    .where(where)
    .groupBy(accounts.id)
    .orderBy(asc(accounts.createdAt), asc(accounts.id));
  return rows.map(({ spentMinor, ...a }) => ({
    ...a,
    balanceMinor: a.anchorAmountMinor - toSafeInteger(spentMinor),
  }));
}

export async function listAccounts(spaceId: SpaceId): Promise<AccountWithBalance[]> {
  return selectWithBalance(db, eq(accounts.spaceId, spaceId));
}

export async function getAccount(
  spaceId: SpaceId,
  id: string,
): Promise<AccountWithBalance | null> {
  const [row] = await selectWithBalance(
    db,
    and(eq(accounts.id, id), eq(accounts.spaceId, spaceId)),
  );
  return row ?? null;
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
  return { ...row, balanceMinor: row.anchorAmountMinor, expenseCount: 0 };
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
    await tx
      .update(accounts)
      .set({
        ...(patch.name !== undefined && { name: patch.name }),
        ...(reanchor && {
          anchorAmountMinor: patch.balanceMinor,
          anchorAt: sql`now()`,
        }),
        updatedAt: sql`now()`,
      })
      .where(eq(accounts.id, id));
    const [row] = await selectWithBalance(tx, eq(accounts.id, id));
    return { row, reanchor };
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
