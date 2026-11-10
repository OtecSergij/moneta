import { describe, expect, it } from "vitest";
import { todayISO } from "@/lib/dates";
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
import { mkExpense, mkMember, mkMigratedOwner, mkSpaceUser } from "@/test/factories";

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

  it("a raw user id is not a SpaceId", async () => {
    const { user } = await mkMigratedOwner();
    // @ts-expect-error a user id must go through resolveSpace() first
    await listCategories(user.id);
  });
});
