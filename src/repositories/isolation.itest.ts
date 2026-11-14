import { describe, expect, expectTypeOf, it } from "vitest";
import { todayISO } from "@/lib/dates";
import type { SpaceId } from "@/lib/space-id";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "@/repositories/categories";
import {
  createExpense,
  deleteExpense,
  getExpense,
  listExpenses,
  summary,
  updateExpense,
} from "@/repositories/expenses";
import {
  deleteTopUp,
  getTopUp,
  listTopUps,
  updateTopUp,
} from "@/repositories/top-ups";
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
  mkMigratedOwner,
  mkSpaceUser,
  mkTopUp,
  mkTransfer,
} from "@/test/factories";

async function setup() {
  const m = await mkMigratedOwner();
  const p = await mkMember(m.spaceId);
  const f = await mkSpaceUser();
  const category = await createCategory(m.spaceId, m.user.id, { name: "Дом" });
  const expense = await mkExpense(m.spaceId, m.user.id, {
    categoryId: category.id,
    amountMinor: 4200,
  });
  return { m, p, f, category, expense };
}

describe("space isolation", () => {
  it("the migrated space's id is the owner's user id", async () => {
    const { m } = await setup();
    expect(m.spaceId).toBe(m.user.id);
  });

  it("a member sees the migrated owner's data, a fresh space does not", async () => {
    const { p, f, category, expense } = await setup();
    const today = todayISO();

    expect((await listCategories(p.spaceId)).map((c) => c.id)).toEqual([
      category.id,
    ]);
    expect((await listExpenses(p.spaceId, "RUB")).map((e) => e.id)).toEqual([
      expense.id,
    ]);
    expect(
      (await summary(p.spaceId, "RUB", { from: today, to: today })).totalMinor,
    ).toBe(4200);

    expect(await listCategories(f.spaceId)).toEqual([]);
    expect(await listExpenses(f.spaceId, "RUB")).toEqual([]);
    expect(
      (await summary(f.spaceId, "RUB", { from: today, to: today })).totalMinor,
    ).toBe(0);
  });

  it("a user of another space cannot read or change the migrated space's data", async () => {
    const { m, f, category, expense } = await setup();

    expect(await getCategory(f.spaceId, category.id)).toBeNull();
    expect(await getExpense(f.spaceId, expense.id)).toBeNull();
    expect(await updateCategory(f.spaceId, category.id, { name: "X" })).toBeNull();
    expect(await updateExpense(f.spaceId, expense.id, { amountMinor: 1 })).toBeNull();
    expect(await deleteExpense(f.spaceId, expense.id)).toEqual({ ok: false });
    expect(await deleteCategory(f.spaceId, category.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(
      await createExpense(f.spaceId, f.user.id, {
        accountId: (await mkAccount(f.spaceId, f.user.id)).id,
        categoryId: category.id,
        amountMinor: 100,
        currency: "RUB",
        note: "чужая категория",
        spentAt: todayISO(),
      }),
    ).toBeNull();

    expect((await getCategory(m.spaceId, category.id))?.name).toBe("Дом");
    expect((await getExpense(m.spaceId, expense.id))?.amountMinor).toBe(4200);
  });

  it("a user of another space cannot list, get, update or delete a top-up", async () => {
    const { m, f, expense } = await setup();
    const topUp = await mkTopUp(m.spaceId, m.user.id, {
      accountId: expense.accountId,
      amountMinor: 3000,
    });

    expect(await listTopUps(f.spaceId, expense.accountId)).toEqual([]);
    expect(await getTopUp(f.spaceId, topUp.id)).toBeNull();
    expect(await updateTopUp(f.spaceId, topUp.id, { amountMinor: 1 })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteTopUp(f.spaceId, topUp.id)).toEqual({ ok: false });

    expect((await getTopUp(m.spaceId, topUp.id))?.amountMinor).toBe(3000);
  });

  it("a user of another space cannot list, create to or from, update or delete a transfer", async () => {
    const { m, f, expense } = await setup();
    const other = await mkAccount(m.spaceId, m.user.id);
    const own = await mkAccount(f.spaceId, f.user.id, { currency: "USD" });
    const transfer = await mkTransfer(m.spaceId, m.user.id, {
      fromAccountId: expense.accountId,
      toAccountId: other.id,
      fromAmountMinor: 3000,
    });

    expect(await listAccountTransfers(f.spaceId, expense.accountId)).toEqual([]);
    expect(
      await createTransfer(
        f.spaceId,
        f.user.id,
        { fromAccountId: expense.accountId, toAccountId: own.id, fromAmountMinor: 1 },
        todayISO(),
      ),
    ).toEqual({ ok: false, reason: "account_not_found" });
    expect(
      await createTransfer(
        f.spaceId,
        f.user.id,
        { fromAccountId: own.id, toAccountId: expense.accountId, fromAmountMinor: 1 },
        todayISO(),
      ),
    ).toEqual({ ok: false, reason: "target_not_found" });
    expect(await updateTransferAmount(f.spaceId, transfer.id, expense.accountId, 1)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteTransfer(f.spaceId, transfer.id, expense.accountId)).toEqual({
      ok: false,
    });

    expect(await listAccountTransfers(f.spaceId, own.id)).toEqual([]);
    expect(await listAccountTransfers(m.spaceId, expense.accountId)).toEqual([
      expect.objectContaining({ id: transfer.id, amountMinor: 3000 }),
    ]);
  });

  it("a raw user id is not a SpaceId", async () => {
    const { user } = await mkMigratedOwner();
    expectTypeOf(user.id).not.toExtend<SpaceId>();
    expectTypeOf(listCategories).parameter(0).toEqualTypeOf<SpaceId>();
    // @ts-expect-error a user id must go through resolveSpace() first
    await listCategories(user.id);
  });
});
