import { subDays } from "date-fns";
import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accounts, transfers } from "@/db/schema";
import { toISODate, todayISO } from "@/lib/dates";
import { deleteAccount } from "@/repositories/accounts";
import { listExpenses, summary } from "@/repositories/expenses";
import {
  createTransfer,
  deleteTransfer,
  listAccountTransfers,
  updateTransferAmount,
} from "@/repositories/transfers";
import {
  mkAccount,
  mkExpense,
  mkMember,
  mkSpaceUser,
  mkTransfer,
} from "@/test/factories";
import { interceptNextInsert } from "@/test/intercept-insert";

async function twoAccounts() {
  const a = await mkSpaceUser();
  const from = await mkAccount(a.spaceId, a.user.id);
  const to = await mkAccount(a.spaceId, a.user.id, { currency: "USD" });
  return { a, from, to };
}

async function transferRow(id: string) {
  const [row] = await db.select().from(transfers).where(eq(transfers.id, id));
  return row;
}

function deleteAccountRow(id: string) {
  return db.delete(accounts).where(eq(accounts.id, id));
}

describe("transfers — database", () => {
  it("a transfer between two accounts of a space is stored; another space's account on either place is rejected with 23503", async () => {
    const { a, from, to } = await twoAccounts();
    const transfer = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
      fromAmountMinor: 1000,
      toAmountMinor: 11,
    });
    expect(await transferRow(transfer.id)).toMatchObject({
      spaceId: a.spaceId,
      fromAccountId: from.id,
      toAccountId: to.id,
      fromAmountMinor: 1000,
      toAmountMinor: 11,
    });

    const b = await mkSpaceUser();
    const foreign = await mkAccount(b.spaceId, b.user.id);
    await expect(
      mkTransfer(a.spaceId, a.user.id, { fromAccountId: foreign.id, toAccountId: to.id }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
    await expect(
      mkTransfer(a.spaceId, a.user.id, { fromAccountId: from.id, toAccountId: foreign.id }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("both amounts must be positive and the places distinct (23514)", async () => {
    const { a, from, to } = await twoAccounts();
    for (const amounts of [
      { fromAmountMinor: 0, toAmountMinor: 100 },
      { fromAmountMinor: -1, toAmountMinor: 100 },
      { fromAmountMinor: 100, toAmountMinor: 0 },
      { fromAmountMinor: 100, toAmountMinor: -1 },
    ]) {
      await expect(
        mkTransfer(a.spaceId, a.user.id, {
          fromAccountId: from.id,
          toAccountId: to.id,
          ...amounts,
        }),
      ).rejects.toMatchObject({ cause: { code: "23514" } });
    }
    await expect(
      mkTransfer(a.spaceId, a.user.id, { fromAccountId: from.id, toAccountId: from.id }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("deleting the source account empties only its place; space_id, the other place and both amounts stay", async () => {
    const { a, from, to } = await twoAccounts();
    const transfer = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
      fromAmountMinor: 1000,
      toAmountMinor: 11,
    });

    await deleteAccountRow(from.id);

    expect(await transferRow(transfer.id)).toMatchObject({
      spaceId: a.spaceId,
      fromAccountId: null,
      toAccountId: to.id,
      fromAmountMinor: 1000,
      toAmountMinor: 11,
    });
  });

  it("deleting the target account empties only its place; space_id, the other place and both amounts stay", async () => {
    const { a, from, to } = await twoAccounts();
    const transfer = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
      fromAmountMinor: 1000,
      toAmountMinor: 11,
    });

    await deleteAccountRow(to.id);

    expect(await transferRow(transfer.id)).toMatchObject({
      spaceId: a.spaceId,
      fromAccountId: from.id,
      toAccountId: null,
      fromAmountMinor: 1000,
      toAmountMinor: 11,
    });
  });

  it("deleting the second account deletes the transfer, in either order", async () => {
    for (const order of ["from-first", "to-first"] as const) {
      const { a, from, to } = await twoAccounts();
      const transfer = await mkTransfer(a.spaceId, a.user.id, {
        fromAccountId: from.id,
        toAccountId: to.id,
      });
      const [first, second] = order === "from-first" ? [from, to] : [to, from];

      await deleteAccountRow(first.id);
      expect(await transferRow(transfer.id)).toBeDefined();
      await deleteAccountRow(second.id);
      expect(await transferRow(transfer.id)).toBeUndefined();
    }
  });

  it("deleting both accounts at once leaves no transfer", async () => {
    for (let i = 0; i < 10; i++) {
      const { a, from, to } = await twoAccounts();
      const transfer = await mkTransfer(a.spaceId, a.user.id, {
        fromAccountId: from.id,
        toAccountId: to.id,
      });

      await Promise.all([deleteAccountRow(from.id), deleteAccountRow(to.id)]);

      expect(await transferRow(transfer.id)).toBeUndefined();
    }
  });

  it("emptying both places by a raw update deletes the row", async () => {
    const { a, from, to } = await twoAccounts();
    const transfer = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
    });

    await db.execute(
      sql`update transfers set from_account_id = null, to_account_id = null where id = ${transfer.id}`,
    );

    expect(await transferRow(transfer.id)).toBeUndefined();
  });

  it("a raw insert with both places empty leaves no row", async () => {
    const a = await mkSpaceUser();
    const inserted = await db.execute<{ id: string }>(
      sql`insert into transfers (space_id, from_account_id, to_account_id, from_amount_minor, to_amount_minor, created_by, entered_on)
          values (${a.spaceId}, null, null, 100, 100, ${a.user.id}, '2026-01-01')
          returning id`,
    );
    expect(inserted).toHaveLength(1);

    expect(await transferRow(inserted[0].id)).toBeUndefined();
  });

  it("the cleanup does not depend on the session's search_path", async () => {
    const { a, from, to } = await twoAccounts();
    const transfer = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
    });

    await db.transaction(async (tx) => {
      await tx.execute(sql`set local search_path = ''`);
      await tx.execute(
        sql`delete from public.accounts where id in (${from.id}, ${to.id})`,
      );
    });

    expect(await transferRow(transfer.id)).toBeUndefined();
  });

  it("deleting an account without expenses but with transfers succeeds; the other account and its transfers stay", async () => {
    const { a, from, to } = await twoAccounts();
    await mkExpense(a.spaceId, a.user.id, { accountId: to.id, currency: "USD" });
    const outgoing = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
    });
    const incoming = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: to.id,
      toAccountId: from.id,
    });

    expect(await deleteAccount(a.spaceId, from.id)).toEqual({ ok: true });

    const [left] = await db.select().from(accounts).where(eq(accounts.id, to.id));
    expect(left).toBeDefined();
    expect(await transferRow(outgoing.id)).toMatchObject({
      fromAccountId: null,
      toAccountId: to.id,
    });
    expect(await transferRow(incoming.id)).toMatchObject({
      fromAccountId: to.id,
      toAccountId: null,
    });
  });
});

const today = todayISO();
const yesterday = toISODate(subDays(new Date(), 1));

afterEach(() => {
  vi.restoreAllMocks();
});

async function countTransfers(spaceId: string) {
  const rows = await db.select().from(transfers).where(eq(transfers.spaceId, spaceId));
  return rows.length;
}

describe("transfers — repository", () => {
  it("createTransfer stores one row with both accounts, both amounts, the author and the given day", async () => {
    const { a, from, to } = await twoAccounts();

    const created = await createTransfer(
      a.spaceId,
      a.user.id,
      { fromAccountId: from.id, toAccountId: to.id, fromAmountMinor: 9000, toAmountMinor: 100 },
      yesterday,
    );

    expect(created).toEqual({ ok: true, transfer: { id: expect.any(String) } });
    if (!created.ok) return;
    expect(await countTransfers(a.spaceId)).toBe(1);
    expect(await transferRow(created.transfer.id)).toMatchObject({
      spaceId: a.spaceId,
      fromAccountId: from.id,
      toAccountId: to.id,
      fromAmountMinor: 9000,
      toAmountMinor: 100,
      createdBy: a.user.id,
      enteredOn: yesterday,
    });
  });

  it("a member creates a transfer in the owner's space", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const from = await mkAccount(owner.spaceId, owner.user.id);
    const to = await mkAccount(owner.spaceId, owner.user.id);

    const created = await createTransfer(
      member.spaceId,
      member.user.id,
      { fromAccountId: from.id, toAccountId: to.id, fromAmountMinor: 500 },
      today,
    );

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await transferRow(created.transfer.id)).toMatchObject({
      spaceId: owner.spaceId,
      createdBy: member.user.id,
      fromAmountMinor: 500,
      toAmountMinor: 500,
    });
  });

  it("same currency: the credit amount equals the debit, whatever credit is sent", async () => {
    const a = await mkSpaceUser();
    const from = await mkAccount(a.spaceId, a.user.id, { currency: "EUR" });
    const to = await mkAccount(a.spaceId, a.user.id, { currency: "EUR" });

    for (const toAmountMinor of [1, undefined]) {
      const created = await createTransfer(
        a.spaceId,
        a.user.id,
        { fromAccountId: from.id, toAccountId: to.id, fromAmountMinor: 2500, toAmountMinor },
        today,
      );
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(await transferRow(created.transfer.id)).toMatchObject({
        fromAmountMinor: 2500,
        toAmountMinor: 2500,
      });
    }
  });

  it("different currencies: both amounts are stored as sent; a missing credit is credit_required, nothing stored", async () => {
    const { a, from, to } = await twoAccounts();

    const created = await createTransfer(
      a.spaceId,
      a.user.id,
      { fromAccountId: from.id, toAccountId: to.id, fromAmountMinor: 10000, toAmountMinor: 123 },
      today,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await transferRow(created.transfer.id)).toMatchObject({
      fromAmountMinor: 10000,
      toAmountMinor: 123,
    });

    expect(
      await createTransfer(
        a.spaceId,
        a.user.id,
        { fromAccountId: from.id, toAccountId: to.id, fromAmountMinor: 10000 },
        today,
      ),
    ).toEqual({ ok: false, reason: "credit_required" });
    expect(await countTransfers(a.spaceId)).toBe(1);
  });

  it("another space's or a missing source → account_not_found; target → target_not_found; nothing stored", async () => {
    const { a, from, to } = await twoAccounts();
    const b = await mkSpaceUser();
    const foreign = await mkAccount(b.spaceId, b.user.id);
    const missing = crypto.randomUUID();

    for (const source of [foreign.id, missing]) {
      expect(
        await createTransfer(
          a.spaceId,
          a.user.id,
          { fromAccountId: source, toAccountId: to.id, fromAmountMinor: 100, toAmountMinor: 1 },
          today,
        ),
      ).toEqual({ ok: false, reason: "account_not_found" });
    }
    for (const target of [foreign.id, missing]) {
      expect(
        await createTransfer(
          a.spaceId,
          a.user.id,
          { fromAccountId: from.id, toAccountId: target, fromAmountMinor: 100, toAmountMinor: 1 },
          today,
        ),
      ).toEqual({ ok: false, reason: "target_not_found" });
    }
    expect(
      await createTransfer(
        a.spaceId,
        a.user.id,
        { fromAccountId: missing, toAccountId: foreign.id, fromAmountMinor: 100, toAmountMinor: 1 },
        today,
      ),
    ).toEqual({ ok: false, reason: "account_not_found" });
    expect(await countTransfers(a.spaceId)).toBe(0);
    expect(await countTransfers(b.spaceId)).toBe(0);
  });

  it("the target deleted between the check and the insert → target_not_found", async () => {
    const { a, from, to } = await twoAccounts();
    interceptNextInsert(() => deleteAccount(a.spaceId, to.id));

    expect(
      await createTransfer(
        a.spaceId,
        a.user.id,
        { fromAccountId: from.id, toAccountId: to.id, fromAmountMinor: 100, toAmountMinor: 1 },
        today,
      ),
    ).toEqual({ ok: false, reason: "target_not_found" });
    expect(await countTransfers(a.spaceId)).toBe(0);
  });

  it("the source deleted between the check and the insert → account_not_found", async () => {
    const { a, from, to } = await twoAccounts();
    interceptNextInsert(() => deleteAccount(a.spaceId, from.id));

    expect(
      await createTransfer(
        a.spaceId,
        a.user.id,
        { fromAccountId: from.id, toAccountId: to.id, fromAmountMinor: 100, toAmountMinor: 1 },
        today,
      ),
    ).toEqual({ ok: false, reason: "account_not_found" });
    expect(await countTransfers(a.spaceId)).toBe(0);
  });

  it("listAccountTransfers shows a transfer on both accounts with each side's amount, the page currency and the other account's name", async () => {
    const { a, from, to } = await twoAccounts();
    const transfer = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
      fromAmountMinor: 9000,
      toAmountMinor: 100,
    });

    expect(await listAccountTransfers(a.spaceId, from.id)).toEqual([
      {
        id: transfer.id,
        side: "out",
        amountMinor: 9000,
        currency: "RUB",
        otherAccountName: to.name,
        enteredOn: today,
        createdAt: transfer.createdAt,
      },
    ]);
    expect(await listAccountTransfers(a.spaceId, to.id)).toEqual([
      {
        id: transfer.id,
        side: "in",
        amountMinor: 100,
        currency: "USD",
        otherAccountName: from.name,
        enteredOn: today,
        createdAt: transfer.createdAt,
      },
    ]);
  });

  it("listAccountTransfers: a transfer whose other account is gone has no name and keeps its amount", async () => {
    for (const gone of ["from", "to"] as const) {
      const { a, from, to } = await twoAccounts();
      const transfer = await mkTransfer(a.spaceId, a.user.id, {
        fromAccountId: from.id,
        toAccountId: to.id,
        fromAmountMinor: 9000,
        toAmountMinor: 100,
      });
      const [deleted, page] = gone === "from" ? [from, to] : [to, from];

      await deleteAccount(a.spaceId, deleted.id);

      expect(await listAccountTransfers(a.spaceId, page.id)).toEqual([
        expect.objectContaining({
          id: transfer.id,
          otherAccountName: null,
          ...(gone === "from"
            ? { side: "in", amountMinor: 100, currency: "USD" }
            : { side: "out", amountMinor: 9000, currency: "RUB" }),
        }),
      ]);
    }
  });

  it("listAccountTransfers orders by day, then by moment of entry, newest first, and returns only the listed fields", async () => {
    const { a, from, to } = await twoAccounts();
    const other = await mkAccount(a.spaceId, a.user.id);
    const first = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
    });
    const second = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: to.id,
      toAccountId: from.id,
    });
    const older = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
      enteredOn: yesterday,
    });
    await mkTransfer(a.spaceId, a.user.id, { fromAccountId: to.id, toAccountId: other.id });

    const listed = await listAccountTransfers(a.spaceId, from.id);
    expect(listed.map((t) => t.id)).toEqual([second.id, first.id, older.id]);
    expect(listed.map((t) => t.side)).toEqual(["in", "out", "out"]);
    for (const row of listed) {
      expect(Object.keys(row).sort()).toEqual(
        ["amountMinor", "createdAt", "currency", "enteredOn", "id", "otherAccountName", "side"],
      );
    }
  });

  it("different currencies: editing on the source page changes only the debit; on the target page only the credit", async () => {
    const { a, from, to } = await twoAccounts();
    const transfer = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
      fromAmountMinor: 9000,
      toAmountMinor: 100,
    });

    expect(await updateTransferAmount(a.spaceId, transfer.id, from.id, 7000)).toEqual({ ok: true });
    expect(await transferRow(transfer.id)).toMatchObject({
      fromAmountMinor: 7000,
      toAmountMinor: 100,
    });

    expect(await updateTransferAmount(a.spaceId, transfer.id, to.id, 80)).toEqual({ ok: true });
    expect(await transferRow(transfer.id)).toMatchObject({
      fromAmountMinor: 7000,
      toAmountMinor: 80,
    });
  });

  it("same currency: editing on either page changes both amounts", async () => {
    const a = await mkSpaceUser();
    const from = await mkAccount(a.spaceId, a.user.id);
    const to = await mkAccount(a.spaceId, a.user.id);
    const transfer = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
    });

    expect(await updateTransferAmount(a.spaceId, transfer.id, from.id, 7000)).toEqual({ ok: true });
    expect(await transferRow(transfer.id)).toMatchObject({
      fromAmountMinor: 7000,
      toAmountMinor: 7000,
    });

    expect(await updateTransferAmount(a.spaceId, transfer.id, to.id, 300)).toEqual({ ok: true });
    expect(await transferRow(transfer.id)).toMatchObject({
      fromAmountMinor: 300,
      toAmountMinor: 300,
    });
  });

  it("with the other account gone, editing changes only the page side", async () => {
    for (const gone of ["from", "to"] as const) {
      const a = await mkSpaceUser();
      const from = await mkAccount(a.spaceId, a.user.id);
      const to = await mkAccount(a.spaceId, a.user.id);
      const transfer = await mkTransfer(a.spaceId, a.user.id, {
        fromAccountId: from.id,
        toAccountId: to.id,
      });
      const [deleted, page] = gone === "from" ? [from, to] : [to, from];
      await deleteAccount(a.spaceId, deleted.id);

      expect(await updateTransferAmount(a.spaceId, transfer.id, page.id, 4200)).toEqual({
        ok: true,
      });
      expect(await transferRow(transfer.id)).toMatchObject(
        gone === "from"
          ? { fromAmountMinor: 1000, toAmountMinor: 4200 }
          : { fromAmountMinor: 4200, toAmountMinor: 1000 },
      );
    }
  });

  it("an account that is not on the transfer, a missing id, another space's transfer → not_found; nothing changes", async () => {
    const { a, from, to } = await twoAccounts();
    const sibling = await mkAccount(a.spaceId, a.user.id);
    const transfer = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
    });
    const b = await mkSpaceUser();
    const before = await transferRow(transfer.id);

    for (const [spaceId, id, accountId] of [
      [a.spaceId, transfer.id, sibling.id],
      [a.spaceId, crypto.randomUUID(), from.id],
      [b.spaceId, transfer.id, from.id],
    ] as const) {
      expect(await updateTransferAmount(spaceId, id, accountId, 1)).toEqual({
        ok: false,
        reason: "not_found",
      });
    }
    expect(await transferRow(transfer.id)).toEqual(before);
  });

  it("an update writes only the amounts of its transfer; every other column stays", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const from = await mkAccount(owner.spaceId, owner.user.id);
    const to = await mkAccount(owner.spaceId, owner.user.id, { currency: "USD" });
    const transfer = await mkTransfer(owner.spaceId, owner.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
      enteredOn: yesterday,
    });
    const untouched = await mkTransfer(owner.spaceId, owner.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
    });

    expect(await updateTransferAmount(member.spaceId, transfer.id, from.id, 4200)).toEqual({
      ok: true,
    });
    expect(await updateTransferAmount(member.spaceId, transfer.id, to.id, 42)).toEqual({
      ok: true,
    });

    expect(await transferRow(transfer.id)).toEqual({
      ...transfer,
      fromAmountMinor: 4200,
      toAmountMinor: 42,
    });
    expect(await transferRow(untouched.id)).toEqual(untouched);
  });

  it("deleteTransfer removes the row from both pages", async () => {
    const { a, from, to } = await twoAccounts();
    const transfer = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
    });
    const kept = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
    });

    expect(await deleteTransfer(a.spaceId, transfer.id, to.id)).toEqual({ ok: true });
    for (const page of [from, to]) {
      expect((await listAccountTransfers(a.spaceId, page.id)).map((t) => t.id)).toEqual([kept.id]);
    }
    expect(await transferRow(transfer.id)).toBeUndefined();
  });

  it("deleteTransfer with an account that is not on the transfer — another account of the space, or the emptied place of a deleted account — deletes nothing", async () => {
    const { a, from, to } = await twoAccounts();
    const sibling = await mkAccount(a.spaceId, a.user.id);
    const transfer = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
    });

    expect(await deleteTransfer(a.spaceId, transfer.id, sibling.id)).toEqual({ ok: false });

    await deleteAccount(a.spaceId, from.id);
    expect(await deleteTransfer(a.spaceId, transfer.id, from.id)).toEqual({ ok: false });
    expect(await transferRow(transfer.id)).toMatchObject({ fromAccountId: null, toAccountId: to.id });
  });

  it("deleteTransfer with another space's id → ok false", async () => {
    const { a, from, to } = await twoAccounts();
    const b = await mkSpaceUser();
    const transfer = await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
    });

    expect(await deleteTransfer(b.spaceId, transfer.id, from.id)).toEqual({ ok: false });
    expect(await transferRow(transfer.id)).toBeDefined();
  });

  it("a member edits and deletes the owner's transfer", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const from = await mkAccount(owner.spaceId, owner.user.id);
    const to = await mkAccount(owner.spaceId, owner.user.id, { currency: "USD" });
    const transfer = await mkTransfer(owner.spaceId, owner.user.id, {
      fromAccountId: from.id,
      toAccountId: to.id,
    });

    expect(await updateTransferAmount(member.spaceId, transfer.id, to.id, 55)).toEqual({
      ok: true,
    });
    expect(await transferRow(transfer.id)).toMatchObject({
      toAmountMinor: 55,
      createdBy: owner.user.id,
    });

    expect(await deleteTransfer(member.spaceId, transfer.id, from.id)).toEqual({ ok: true });
    expect(await transferRow(transfer.id)).toBeUndefined();
  });

  it("history summary and listExpenses ignore transfers", async () => {
    const a = await mkSpaceUser();
    const expense = await mkExpense(a.spaceId, a.user.id, { amountMinor: 1500 });
    const other = await mkAccount(a.spaceId, a.user.id);
    const range = { from: today, to: today };
    const before = await summary(a.spaceId, "RUB", range);

    await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: expense.accountId,
      toAccountId: other.id,
      fromAmountMinor: 9000,
    });
    await mkTransfer(a.spaceId, a.user.id, {
      fromAccountId: other.id,
      toAccountId: expense.accountId,
      fromAmountMinor: 7000,
    });

    expect(await summary(a.spaceId, "RUB", range)).toEqual(before);
    expect((await listExpenses(a.spaceId, "RUB")).map((e) => e.id)).toEqual([expense.id]);
    expect(
      (await listExpenses(a.spaceId, "RUB", { accountId: expense.accountId })).map((e) => e.id),
    ).toEqual([expense.id]);
  });
});
