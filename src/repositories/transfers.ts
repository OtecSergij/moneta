import { and, desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { accounts, transfers } from "@/db/schema";
import type { CurrencyCode } from "@/lib/currency";
import { isForeignKeyViolation } from "@/lib/db-errors";
import type { SpaceId } from "@/lib/space-id";
import type { TransferInput } from "@/lib/transfers";
import { accountsOfSpace } from "./accounts";

export type AccountTransfer = {
  id: string;
  side: "out" | "in";
  amountMinor: number;
  currency: CurrencyCode;
  otherAccountName: string | null;
  enteredOn: string;
  createdAt: Date;
};

type CreateTransferResult =
  | { ok: true; transfer: { id: string } }
  | { ok: false; reason: "account_not_found" | "target_not_found" | "credit_required" };

type UpdateTransferResult = { ok: true } | { ok: false; reason: "not_found" };

function onAccount(accountId: string) {
  return or(eq(transfers.fromAccountId, accountId), eq(transfers.toAccountId, accountId));
}

export async function createTransfer(
  spaceId: SpaceId,
  userId: string,
  input: TransferInput,
  enteredOn: string,
): Promise<CreateTransferResult> {
  const { fromAccountId, toAccountId } = input;
  const found = await accountsOfSpace(db, spaceId, [fromAccountId, toAccountId]);
  const from = found.find((a) => a.id === fromAccountId);
  const to = found.find((a) => a.id === toAccountId);
  if (!from) return { ok: false, reason: "account_not_found" };
  if (!to) return { ok: false, reason: "target_not_found" };

  const toAmountMinor =
    from.currency === to.currency ? input.fromAmountMinor : input.toAmountMinor;
  if (toAmountMinor === undefined) return { ok: false, reason: "credit_required" };

  try {
    const [transfer] = await db
      .insert(transfers)
      .values({
        spaceId,
        fromAccountId,
        toAccountId,
        fromAmountMinor: input.fromAmountMinor,
        toAmountMinor,
        createdBy: userId,
        enteredOn,
      })
      .returning({ id: transfers.id });
    return { ok: true, transfer };
  } catch (err) {
    if (!isForeignKeyViolation(err)) throw err;
    const [source] = await accountsOfSpace(db, spaceId, [fromAccountId]);
    return { ok: false, reason: source ? "target_not_found" : "account_not_found" };
  }
}

export async function listAccountTransfers(
  spaceId: SpaceId,
  pageAccountId: string,
): Promise<AccountTransfer[]> {
  const accountId = pageAccountId.toLowerCase();
  const fromAccount = alias(accounts, "from_account");
  const toAccount = alias(accounts, "to_account");
  const rows = await db
    .select({
      id: transfers.id,
      fromAccountId: transfers.fromAccountId,
      fromAmountMinor: transfers.fromAmountMinor,
      toAmountMinor: transfers.toAmountMinor,
      enteredOn: transfers.enteredOn,
      createdAt: transfers.createdAt,
      fromName: fromAccount.name,
      fromCurrency: fromAccount.currency,
      toName: toAccount.name,
      toCurrency: toAccount.currency,
    })
    .from(transfers)
    .leftJoin(
      fromAccount,
      and(
        eq(fromAccount.id, transfers.fromAccountId),
        eq(fromAccount.spaceId, transfers.spaceId),
      ),
    )
    .leftJoin(
      toAccount,
      and(eq(toAccount.id, transfers.toAccountId), eq(toAccount.spaceId, transfers.spaceId)),
    )
    .where(and(eq(transfers.spaceId, spaceId), onAccount(accountId)))
    .orderBy(desc(transfers.enteredOn), desc(transfers.createdAt));

  // The page account is on one of the places, so the FK guarantees its join row.
  return rows.map((r) => {
    const out = r.fromAccountId === accountId;
    return {
      id: r.id,
      side: out ? "out" : "in",
      amountMinor: out ? r.fromAmountMinor : r.toAmountMinor,
      currency: (out ? r.fromCurrency : r.toCurrency)!,
      otherAccountName: out ? r.toName : r.fromName,
      enteredOn: r.enteredOn,
      createdAt: r.createdAt,
    };
  });
}

export async function updateTransferAmount(
  spaceId: SpaceId,
  id: string,
  pageAccountId: string,
  amountMinor: number,
): Promise<UpdateTransferResult> {
  const accountId = pageAccountId.toLowerCase();
  const where = and(eq(transfers.id, id), eq(transfers.spaceId, spaceId));
  return db.transaction(async (tx) => {
    const [transfer] = await tx
      .select({
        fromAccountId: transfers.fromAccountId,
        toAccountId: transfers.toAccountId,
      })
      .from(transfers)
      .where(where)
      .for("update");
    if (!transfer) return { ok: false, reason: "not_found" };

    const { fromAccountId, toAccountId } = transfer;
    const out = fromAccountId === accountId;
    if (!out && toAccountId !== accountId) return { ok: false, reason: "not_found" };

    let bothSides = false;
    if (fromAccountId !== null && toAccountId !== null) {
      const places = await accountsOfSpace(tx, spaceId, [fromAccountId, toAccountId]);
      bothSides = places.length === 2 && places[0].currency === places[1].currency;
    }

    await tx
      .update(transfers)
      .set(
        bothSides
          ? { fromAmountMinor: amountMinor, toAmountMinor: amountMinor }
          : out
            ? { fromAmountMinor: amountMinor }
            : { toAmountMinor: amountMinor },
      )
      .where(where);
    return { ok: true };
  });
}

export async function deleteTransfer(
  spaceId: SpaceId,
  id: string,
  accountId: string,
): Promise<{ ok: boolean }> {
  const deleted = await db
    .delete(transfers)
    .where(and(eq(transfers.id, id), eq(transfers.spaceId, spaceId), onAccount(accountId)))
    .returning({ id: transfers.id });
  return { ok: deleted.length > 0 };
}
