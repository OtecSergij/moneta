import { and, asc, eq, getTableColumns, gt, inArray, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, type DbExecutor } from "@/db";
import { accounts, expenses, topUps, transfers } from "@/db/schema";
import type { AccountInput, AccountPatch } from "@/lib/accounts";
import type { SpaceId } from "@/lib/space-id";
import { deleteWithoutExpenses, type DeleteUnusedResult } from "./delete-unused";

type Account = typeof accounts.$inferSelect;
type AccountWithBalance = Account & { balanceMinor: number; expenseCount: number };

function toSafeInteger(value: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`account balance out of range: ${value}`);
  return n;
}

type LinkTable = typeof expenses | typeof topUps | typeof transfers;
type Link = { table: LinkTable; amount: AnyPgColumn; accountId: AnyPgColumn };

const spent: Link = { table: expenses, amount: expenses.amountMinor, accountId: expenses.accountId };
const toppedUp: Link = { table: topUps, amount: topUps.amountMinor, accountId: topUps.accountId };
const sentOut: Link = {
  table: transfers,
  amount: transfers.fromAmountMinor,
  accountId: transfers.fromAccountId,
};
const receivedIn: Link = {
  table: transfers,
  amount: transfers.toAmountMinor,
  accountId: transfers.toAccountId,
};

function linkedTo({ table, accountId }: Link): SQL | undefined {
  return and(eq(accountId, accounts.id), eq(table.spaceId, accounts.spaceId));
}

// Correlated subqueries, not a join: joining the child tables would multiply
// rows and count each sum several times. A transfer is two links, one per
// place, so it adds a debit sum and a credit sum, each compared with the
// anchor of the account on that place. Built with the query builder so the
// correlation conditions in where() stay table-qualified; the subquery's own
// select list is still rendered unqualified (see src/repositories/categories.ts),
// so keep outer columns out of it.
function sumAfterAnchor(executor: DbExecutor, link: Link): SQL<string> {
  const total = executor
    .select({ total: sql`coalesce(sum(${link.amount}), 0)` })
    .from(link.table)
    .where(and(linkedTo(link), gt(link.table.createdAt, accounts.anchorAt)));
  return sql<string>`(${total})::bigint`;
}

async function selectWithBalance(
  executor: DbExecutor,
  where: SQL | undefined,
): Promise<AccountWithBalance[]> {
  const expenseCount = executor
    .select({ count: sql`count(*)` })
    .from(expenses)
    .where(linkedTo(spent));
  const rows = await executor
    .select({
      ...getTableColumns(accounts),
      spentMinor: sumAfterAnchor(executor, spent),
      toppedUpMinor: sumAfterAnchor(executor, toppedUp),
      sentOutMinor: sumAfterAnchor(executor, sentOut),
      receivedInMinor: sumAfterAnchor(executor, receivedIn),
      expenseCount: sql<number>`(${expenseCount})::int`,
    })
    .from(accounts)
    .where(where)
    .orderBy(asc(accounts.createdAt), asc(accounts.id));
  return rows.map(({ spentMinor, toppedUpMinor, sentOutMinor, receivedInMinor, ...a }) => {
    // BigInt: with four sums an intermediate value can pass 2^53 and come back
    // into range already rounded, which the check on the result can't see.
    const balance =
      BigInt(a.anchorAmountMinor) -
      BigInt(spentMinor) +
      BigInt(toppedUpMinor) -
      BigInt(sentOutMinor) +
      BigInt(receivedInMinor);
    return { ...a, balanceMinor: toSafeInteger(balance.toString()) };
  });
}

export async function listAccounts(spaceId: SpaceId): Promise<AccountWithBalance[]> {
  return selectWithBalance(db, eq(accounts.spaceId, spaceId));
}

export async function listAccountOptions(
  spaceId: SpaceId,
): Promise<Pick<Account, "id" | "name" | "currency">[]> {
  return db
    .select({ id: accounts.id, name: accounts.name, currency: accounts.currency })
    .from(accounts)
    .where(eq(accounts.spaceId, spaceId))
    .orderBy(asc(accounts.createdAt), asc(accounts.id));
}

export function accountsOfSpace(executor: DbExecutor, spaceId: SpaceId, ids: string[]) {
  return executor
    .select({ id: accounts.id, currency: accounts.currency })
    .from(accounts)
    .where(and(inArray(accounts.id, ids), eq(accounts.spaceId, spaceId)));
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
      color: input.color,
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
        ...(patch.color !== undefined && { color: patch.color }),
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
): Promise<DeleteUnusedResult> {
  return deleteWithoutExpenses(spaceId, id, accounts, expenses.accountId);
}
