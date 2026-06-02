import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLORS,
  createCategory,
} from "@/repositories/categories";
import {
  ExpenseInput,
  createExpense,
  deleteExpense,
  lastUsedCategoryId,
  listExpenses,
  summary,
  updateExpense,
} from "@/repositories/expenses";
import { mkUser } from "@/test/factories";

const today = new Date().toISOString().slice(0, 10);

describe("expenses repository — isolation", () => {
  it("listExpenses returns only own rows", async () => {
    const a = await mkUser();
    const b = await mkUser();
    const catA = await createCategory(a.id, {
      name: "A-food",
      color: CATEGORY_COLORS[0],
    });
    const catB = await createCategory(b.id, {
      name: "B-food",
      color: CATEGORY_COLORS[0],
    });

    await createExpense(a.id, {
      categoryId: catA.id,
      amountMinor: 10000,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });
    await createExpense(b.id, {
      categoryId: catB.id,
      amountMinor: 20000,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });

    const aList = await listExpenses(a.id);
    const bList = await listExpenses(b.id);
    expect(aList.map((e) => e.amountMinor)).toEqual([10000]);
    expect(bList.map((e) => e.amountMinor)).toEqual([20000]);
  });

  it("updateExpense by another user returns null and does not modify", async () => {
    const a = await mkUser();
    const b = await mkUser();
    const catA = await createCategory(a.id, {
      name: "A-cat",
      color: CATEGORY_COLORS[0],
    });
    const exp = await createExpense(a.id, {
      categoryId: catA.id,
      amountMinor: 5000,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });
    expect(exp).not.toBeNull();

    const result = await updateExpense(b.id, exp!.id, { amountMinor: 1 });
    expect(result).toBeNull();

    const [stillThere] = await listExpenses(a.id);
    expect(stillThere.amountMinor).toBe(5000);
  });

  it("deleteExpense by another user returns ok:false and does not delete", async () => {
    const a = await mkUser();
    const b = await mkUser();
    const catA = await createCategory(a.id, {
      name: "A-cat",
      color: CATEGORY_COLORS[0],
    });
    const exp = await createExpense(a.id, {
      categoryId: catA.id,
      amountMinor: 7000,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });

    expect(await deleteExpense(b.id, exp!.id)).toEqual({ ok: false });
    expect(await listExpenses(a.id)).toHaveLength(1);
  });

  it("createExpense rejects categoryId belonging to another user", async () => {
    const a = await mkUser();
    const b = await mkUser();
    const catA = await createCategory(a.id, {
      name: "A-private",
      color: CATEGORY_COLORS[0],
    });

    // B tries to attach an expense to A's category — must be rejected.
    const result = await createExpense(b.id, {
      categoryId: catA.id,
      amountMinor: 100,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });
    expect(result).toBeNull();
    expect(await listExpenses(b.id)).toEqual([]);
    expect(await listExpenses(a.id)).toEqual([]);
  });

  it("summary aggregates only own data", async () => {
    const a = await mkUser();
    const b = await mkUser();
    const catA = await createCategory(a.id, {
      name: "Food",
      color: CATEGORY_COLORS[5],
    });
    const catB = await createCategory(b.id, {
      name: "Food",
      color: CATEGORY_COLORS[5],
    });

    await createExpense(a.id, {
      categoryId: catA.id,
      amountMinor: 30000,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });
    await createExpense(a.id, {
      categoryId: catA.id,
      amountMinor: 12000,
      currency: "RUB",
      note: "ужин",
      spentAt: today,
    });
    await createExpense(b.id, {
      categoryId: catB.id,
      amountMinor: 99999,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });

    const aSummary = await summary(a.id, { from: today, to: today });
    expect(aSummary.totalMinor).toBe(42000);
    expect(aSummary.byCategory).toHaveLength(1);
    expect(aSummary.byCategory[0].totalMinor).toBe(42000);
    expect(aSummary.byCategory[0].name).toBe("Food");

    const bSummary = await summary(b.id, { from: today, to: today });
    expect(bSummary.totalMinor).toBe(99999);
  });

  it("updateExpense changes the note", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Food",
      color: CATEGORY_COLORS[0],
    });
    const exp = await createExpense(u.id, {
      categoryId: cat.id,
      amountMinor: 100,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });
    expect(exp!.note).toBe("обед");

    const updated = await updateExpense(u.id, exp!.id, { note: "ужин" });
    expect(updated!.note).toBe("ужин");
  });
});

describe("lastUsedCategoryId", () => {
  it("returns null when the user has no expenses", async () => {
    const u = await mkUser();
    expect(await lastUsedCategoryId(u.id)).toBeNull();
  });

  it("returns the most recently created expense's category, ignoring other users", async () => {
    const u = await mkUser();
    const other = await mkUser();
    const food = await createCategory(u.id, {
      name: "Food",
      color: CATEGORY_COLORS[0],
    });
    const taxi = await createCategory(u.id, {
      name: "Taxi",
      color: CATEGORY_COLORS[1],
    });
    const otherCat = await createCategory(other.id, {
      name: "Other",
      color: CATEGORY_COLORS[2],
    });

    await createExpense(u.id, {
      categoryId: food.id,
      amountMinor: 100,
      currency: "RUB",
      note: "продукты",
      spentAt: today,
    });
    // Created later but spent earlier — "last used" follows creation order.
    await createExpense(u.id, {
      categoryId: taxi.id,
      amountMinor: 200,
      currency: "RUB",
      note: "такси",
      spentAt: "2020-01-01",
    });
    // Another user's later expense must not leak into u's result.
    await createExpense(other.id, {
      categoryId: otherCat.id,
      amountMinor: 300,
      currency: "RUB",
      note: "прочее",
      spentAt: today,
    });

    expect(await lastUsedCategoryId(u.id)).toBe(taxi.id);
  });
});

describe("ExpenseInput.note", () => {
  it("requires a non-empty description and trims it", () => {
    const base = {
      categoryId: crypto.randomUUID(),
      amountMinor: 100,
      spentAt: today,
    };
    expect(ExpenseInput.safeParse(base).success).toBe(false);
    expect(ExpenseInput.safeParse({ ...base, note: "" }).success).toBe(false);
    expect(ExpenseInput.safeParse({ ...base, note: "   " }).success).toBe(false);
    expect(ExpenseInput.parse({ ...base, note: " обед " }).note).toBe("обед");
  });
});
