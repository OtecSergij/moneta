import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLORS,
  createCategory,
} from "@/repositories/categories";
import {
  ExpenseInput,
  createExpense,
  deleteExpense,
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
      spentAt: today,
    });
    await createExpense(b.id, {
      categoryId: catB.id,
      amountMinor: 20000,
      currency: "RUB",
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
      spentAt: today,
    });
    await createExpense(a.id, {
      categoryId: catA.id,
      amountMinor: 12000,
      currency: "RUB",
      spentAt: today,
    });
    await createExpense(b.id, {
      categoryId: catB.id,
      amountMinor: 99999,
      currency: "RUB",
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

  it("updateExpense clears the note when set to null", async () => {
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

    const cleared = await updateExpense(u.id, exp!.id, { note: null });
    expect(cleared!.note).toBeNull();
  });
});

describe("ExpenseInput.note", () => {
  it("maps an empty or blank note to null so an update can clear it", () => {
    const base = {
      categoryId: crypto.randomUUID(),
      amountMinor: 100,
      spentAt: today,
    };
    expect(ExpenseInput.parse({ ...base, note: "" }).note).toBeNull();
    expect(ExpenseInput.parse({ ...base, note: "   " }).note).toBeNull();
    expect(ExpenseInput.parse({ ...base, note: " обед " }).note).toBe("обед");
  });
});
