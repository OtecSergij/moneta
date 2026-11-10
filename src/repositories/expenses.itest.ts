import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { CURRENCY_CODES, currencyMeta } from "@/lib/currency";
import {
  CATEGORY_COLORS,
  createCategory,
} from "@/repositories/categories";
import {
  ExpenseInput,
  createExpense,
  deleteExpense,
  getExpense,
  lastUsedCategoryId,
  lastUsedCurrency,
  listExpenses,
  summary,
  updateExpense,
} from "@/repositories/expenses";
import {
  clearRates,
  mkExpense,
  mkMember,
  mkRate,
  mkSpaceUser,
} from "@/test/factories";

const today = new Date().toISOString().slice(0, 10);

beforeEach(clearRates);

describe("expenses repository — isolation", () => {
  it("listExpenses returns only own rows", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const catA = await createCategory(a.spaceId, a.user.id, {
      name: "A-food",
      color: CATEGORY_COLORS[0],
    });
    const catB = await createCategory(b.spaceId, b.user.id, {
      name: "B-food",
      color: CATEGORY_COLORS[0],
    });

    await createExpense(a.spaceId, a.user.id, {
      categoryId: catA.id,
      amountMinor: 10000,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });
    await createExpense(b.spaceId, b.user.id, {
      categoryId: catB.id,
      amountMinor: 20000,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });

    const aList = await listExpenses(a.spaceId, "RUB");
    const bList = await listExpenses(b.spaceId, "RUB");
    expect(aList.map((e) => e.amountMinor)).toEqual([10000]);
    expect(bList.map((e) => e.amountMinor)).toEqual([20000]);
  });

  it("updateExpense by another user returns null and does not modify", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const catA = await createCategory(a.spaceId, a.user.id, {
      name: "A-cat",
      color: CATEGORY_COLORS[0],
    });
    const exp = await createExpense(a.spaceId, a.user.id, {
      categoryId: catA.id,
      amountMinor: 5000,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });
    expect(exp).not.toBeNull();

    const result = await updateExpense(b.spaceId, exp!.id, { amountMinor: 1 });
    expect(result).toBeNull();

    const [stillThere] = await listExpenses(a.spaceId, "RUB");
    expect(stillThere.amountMinor).toBe(5000);
  });

  it("deleteExpense by another user returns ok:false and does not delete", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const catA = await createCategory(a.spaceId, a.user.id, {
      name: "A-cat",
      color: CATEGORY_COLORS[0],
    });
    const exp = await createExpense(a.spaceId, a.user.id, {
      categoryId: catA.id,
      amountMinor: 7000,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });

    expect(await deleteExpense(b.spaceId, exp!.id)).toEqual({ ok: false });
    expect(await listExpenses(a.spaceId, "RUB")).toHaveLength(1);
  });

  it("createExpense rejects categoryId belonging to another user", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const catA = await createCategory(a.spaceId, a.user.id, {
      name: "A-private",
      color: CATEGORY_COLORS[0],
    });

    // B tries to attach an expense to A's category — must be rejected.
    const result = await createExpense(b.spaceId, b.user.id, {
      categoryId: catA.id,
      amountMinor: 100,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });
    expect(result).toBeNull();
    expect(await listExpenses(b.spaceId, "RUB")).toEqual([]);
    expect(await listExpenses(a.spaceId, "RUB")).toEqual([]);
  });

  it("summary aggregates only own data", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const catA = await createCategory(a.spaceId, a.user.id, {
      name: "Food",
      color: CATEGORY_COLORS[5],
    });
    const catB = await createCategory(b.spaceId, b.user.id, {
      name: "Food",
      color: CATEGORY_COLORS[5],
    });

    await createExpense(a.spaceId, a.user.id, {
      categoryId: catA.id,
      amountMinor: 30000,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });
    await createExpense(a.spaceId, a.user.id, {
      categoryId: catA.id,
      amountMinor: 12000,
      currency: "RUB",
      note: "ужин",
      spentAt: today,
    });
    await createExpense(b.spaceId, b.user.id, {
      categoryId: catB.id,
      amountMinor: 99999,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });

    // RUB shown in RUB needs no fx_rates at all (beforeEach clears them), and
    // must never be marked approximate (AC-16).
    const aSummary = await summary(a.spaceId, "RUB", { from: today, to: today });
    expect(aSummary).toMatchObject({ totalMinor: 42000, unconverted: 0 });
    expect(aSummary.byCategory).toHaveLength(1);
    expect(aSummary.byCategory[0]).toMatchObject({
      name: "Food",
      totalMinor: 42000,
      unconverted: 0,
    });

    const bSummary = await summary(b.spaceId, "RUB", { from: today, to: today });
    expect(bSummary.totalMinor).toBe(99999);
  });

  it("updateExpense changes the note", async () => {
    const u = await mkSpaceUser();
    const cat = await createCategory(u.spaceId, u.user.id, {
      name: "Food",
      color: CATEGORY_COLORS[0],
    });
    const exp = await createExpense(u.spaceId, u.user.id, {
      categoryId: cat.id,
      amountMinor: 100,
      currency: "RUB",
      note: "обед",
      spentAt: today,
    });
    expect(exp!.note).toBe("обед");

    const updated = await updateExpense(u.spaceId, exp!.id, { note: "ужин" });
    expect(updated!.note).toBe("ужин");
  });
});

describe("lastUsedCategoryId", () => {
  it("returns null when the user has no expenses", async () => {
    const u = await mkSpaceUser();
    expect(await lastUsedCategoryId(u.spaceId, u.user.id)).toBeNull();
  });

  it("returns the most recently created expense's category, ignoring other users", async () => {
    const u = await mkSpaceUser();
    const other = await mkSpaceUser();
    const food = await createCategory(u.spaceId, u.user.id, {
      name: "Food",
      color: CATEGORY_COLORS[0],
    });
    const taxi = await createCategory(u.spaceId, u.user.id, {
      name: "Taxi",
      color: CATEGORY_COLORS[1],
    });
    const otherCat = await createCategory(other.spaceId, other.user.id, {
      name: "Other",
      color: CATEGORY_COLORS[2],
    });

    await createExpense(u.spaceId, u.user.id, {
      categoryId: food.id,
      amountMinor: 100,
      currency: "RUB",
      note: "продукты",
      spentAt: today,
    });
    // Created later but spent earlier — "last used" follows creation order.
    await createExpense(u.spaceId, u.user.id, {
      categoryId: taxi.id,
      amountMinor: 200,
      currency: "RUB",
      note: "такси",
      spentAt: "2020-01-01",
    });
    // Another user's later expense must not leak into u's result.
    await createExpense(other.spaceId, other.user.id, {
      categoryId: otherCat.id,
      amountMinor: 300,
      currency: "RUB",
      note: "прочее",
      spentAt: today,
    });

    expect(await lastUsedCategoryId(u.spaceId, u.user.id)).toBe(taxi.id);
  });
});

describe("ExpenseInput.note", () => {
  it("requires a non-empty description and trims it", () => {
    const base = {
      categoryId: crypto.randomUUID(),
      amountMinor: 100,
      currency: "RUB",
      spentAt: today,
    };
    expect(ExpenseInput.safeParse(base).success).toBe(false);
    expect(ExpenseInput.safeParse({ ...base, note: "" }).success).toBe(false);
    expect(ExpenseInput.safeParse({ ...base, note: "   " }).success).toBe(false);
    expect(ExpenseInput.parse({ ...base, note: " обед " }).note).toBe("обед");
  });
});

// ---------------------------------------------------------------------------
// Multi-currency acceptance criteria (plan Step 8,
// .omc/plans/multi-currency-expenses.md).
//
// fx_rates is a GLOBAL table (no user_id, see db/schema/fx-rates.ts) shared by
// every itest in the run; the beforeEach at the top of this file clears it, so
// each test below sees only the rates it seeds itself and `rateFor`'s
// nearest-earlier lookup can't reach into another test's data.
// ---------------------------------------------------------------------------

describe("summary — rate selection uses the row's own date (AC-9)", () => {
  it("converts using the rate on file for the row's own spentAt, not a later rate for the same currency", async () => {
    const u = await mkSpaceUser();
    const earlyDate = "2025-04-10";
    const lateDate = "2025-05-25"; // 45 days later — outside every lookup window

    await mkRate({ currency: "RUB", effectiveDate: earlyDate, rateToUsd: "0.01050000000000000000" });
    await mkRate({ currency: "RUB", effectiveDate: lateDate, rateToUsd: "0.01300000000000000000" });
    await mkRate({ currency: "USD", effectiveDate: earlyDate, rateToUsd: "1.00000000000000000000" });

    await mkExpense(u.spaceId, u.user.id, {
      amountMinor: 500000, // 5000.00 RUB
      currency: "RUB",
      spentAt: earlyDate,
    });

    // The range spans both rate dates so the later RUB rate is actually
    // loaded into the index (summary bounds it by `to`) — otherwise the test
    // wouldn't prove anything.
    const result = await summary(u.spaceId, "USD", { from: earlyDate, to: lateDate });

    // 5000 RUB * 0.0105 USD/RUB = 52.50 USD = 5250 cents — the early rate.
    // The later rate (0.013) would give 6500 instead.
    expect(result.totalMinor).toBe(5250);
  });

  it("listExpenses converts each row by the rate of its own date", async () => {
    const u = await mkSpaceUser();
    const earlyDate = "2025-04-10";
    const lateDate = "2025-05-25";

    await mkRate({ currency: "RUB", effectiveDate: earlyDate, rateToUsd: "0.01050000000000000000" });
    await mkRate({ currency: "RUB", effectiveDate: lateDate, rateToUsd: "0.01300000000000000000" });
    await mkRate({ currency: "USD", effectiveDate: earlyDate, rateToUsd: "1.00000000000000000000" });

    // The late row puts the late rate into the index, so the early row
    // converting at 5250 proves it looked up its own date.
    const early = await mkExpense(u.spaceId, u.user.id, { amountMinor: 500000, currency: "RUB", spentAt: earlyDate });
    const late = await mkExpense(u.spaceId, u.user.id, { amountMinor: 500000, currency: "RUB", spentAt: lateDate });

    const rows = await listExpenses(u.spaceId, "USD");
    const byId = new Map(rows.map((r) => [r.id, r.convertedMinor]));
    expect(byId.get(early.id)).toBe(5250);
    expect(byId.get(late.id)).toBe(6500);
  });
});

describe("BTC amounts beyond INTEGER range (AC-17)", () => {
  it("stores, reads back, and sums 25 BTC exactly without overflow", async () => {
    const u = await mkSpaceUser();
    const date = "2025-10-20";
    const amountMinor = 2_500_000_000; // 25 BTC in satoshi — above INTEGER's ~2.1e9 ceiling

    const created = await mkExpense(u.spaceId, u.user.id, { amountMinor, currency: "BTC", spentAt: date });
    expect(created.amountMinor).toBe(amountMinor);

    const [reread] = await listExpenses(u.spaceId, "BTC", { categoryId: created.categoryId });
    expect(reread.amountMinor).toBe(amountMinor);
    expect(reread.convertedMinor).toBe(amountMinor); // identity: BTC shown in BTC

    await mkRate({ currency: "BTC", effectiveDate: date, rateToUsd: "65000.00000000000000000000" });
    await mkRate({ currency: "RUB", effectiveDate: date, rateToUsd: "0.01050000000000000000" });

    const result = await summary(u.spaceId, "RUB", { from: date, to: date });
    expect(result.totalMinor).toBeGreaterThan(0);
    expect(Number.isSafeInteger(result.totalMinor)).toBe(true);
  });
});

describe("read paths never touch the network (AC-23)", () => {
  it("summary() and listExpenses() do not throw when fetch is broken, over mixed-currency data", async () => {
    const u = await mkSpaceUser();
    const date = "2026-01-25";
    await mkRate({ currency: "USD", effectiveDate: date, rateToUsd: "1.00000000000000000000" });
    await mkRate({ currency: "RUB", effectiveDate: date, rateToUsd: "0.01050000000000000000" });
    // BTC's rate is deliberately left unseeded, so this also exercises the
    // "no rate available" branch alongside the converted ones — without
    // either branch throwing.
    await mkExpense(u.spaceId, u.user.id, { amountMinor: 10000, currency: "RUB", spentAt: date });
    await mkExpense(u.spaceId, u.user.id, { amountMinor: 5000, currency: "USD", spentAt: date });
    await mkExpense(u.spaceId, u.user.id, { amountMinor: 100000, currency: "BTC", spentAt: date });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("a read path must never call fetch");
    }) as unknown as typeof globalThis.fetch;

    try {
      const list = await listExpenses(u.spaceId, "RUB", { from: date, to: date });
      expect(list).toHaveLength(3);

      const result = await summary(u.spaceId, "RUB", { from: date, to: date });
      expect(result.totalMinor).toBeGreaterThan(0);
      // The BTC row contributes nothing, so the total is short by real money
      // and has to say so — presented bare it reads as an exact figure.
      expect(result.unconverted).toBe(1);
      const btcCategory = result.byCategory.find((c) => c.unconverted > 0);
      expect(btcCategory).toMatchObject({ totalMinor: 0, unconverted: 1 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("summary — category totals reconcile with the period total (AC-29)", () => {
  it("keeps |period total - sum of category totals| within ceil(N/2) display units, across all five display currencies", async () => {
    const u = await mkSpaceUser();
    const date = "2026-05-01";
    const rates = {
      RUB: "0.01040000000000000000",
      USD: "1.00000000000000000000",
      EUR: "1.09000000000000000000",
      RSD: "0.00930000000000000000",
      BTC: "65000.00000000000000000000",
    };
    for (const currency of CURRENCY_CODES) {
      await mkRate({ currency, effectiveDate: date, rateToUsd: rates[currency] });
    }

    const categories = [];
    for (let i = 0; i < 6; i++) {
      categories.push(
        await createCategory(u.spaceId, u.user.id, {
          name: `Category ${i}`,
          color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
        }),
      );
    }

    let n = 0;
    for (const cat of categories) {
      for (const currency of CURRENCY_CODES) {
        for (let k = 0; k < 2; k++) {
          n++;
          const amountMinor =
            currency === "BTC"
              ? 10_000 + ((n * 6173) % 90_000) // ~0.0001-0.001 BTC
              : 500 + ((n * 6173) % 20_000);
          await mkExpense(u.spaceId, u.user.id, {
            categoryId: cat.id,
            amountMinor,
            currency,
            spentAt: date,
          });
        }
      }
    }
    expect(n).toBe(60);

    for (const display of CURRENCY_CODES) {
      const result = await summary(u.spaceId, display, { from: date, to: date });
      expect(result.byCategory.length).toBe(6);

      const sumOfCategories = result.byCategory.reduce((s, c) => s + c.totalMinor, 0);
      const meta = currencyMeta(display);
      const unit = 10 ** (meta.exponent - meta.displayDigits);
      const tolerance = Math.ceil(result.byCategory.length / 2) * unit;

      expect(Math.abs(result.totalMinor - sumOfCategories)).toBeLessThanOrEqual(tolerance);
    }
  });
});

describe("createExpense — entry date bound", () => {
  it("rejects a date beyond one day ahead of the server", async () => {
    const u = await mkSpaceUser();
    const cat = await createCategory(u.spaceId, u.user.id, {
      name: "Future guard",
      color: CATEGORY_COLORS[3],
    });
    const base = {
      categoryId: cat.id,
      currency: "BTC" as const,
      amountMinor: 10000,
      note: "из будущего",
    };

    const farFuture = new Date();
    farFuture.setUTCDate(farFuture.getUTCDate() + 30);
    const rejected = await createExpense(u.spaceId, u.user.id, {
      ...base,
      spentAt: farFuture.toISOString().slice(0, 10),
    });
    expect(rejected).toBeNull();

    // One day ahead is allowed: a client east of the server legitimately
    // reports tomorrow's date as its today.
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const accepted = await createExpense(u.spaceId, u.user.id, {
      ...base,
      spentAt: tomorrow.toISOString().slice(0, 10),
    });
    expect(accepted).not.toBeNull();
  });

  it("updateExpense rejects moving a row beyond one day ahead of the server", async () => {
    const u = await mkSpaceUser();
    const created = await mkExpense(u.spaceId, u.user.id, { spentAt: today });

    const farFuture = new Date();
    farFuture.setUTCDate(farFuture.getUTCDate() + 30);
    const rejected = await updateExpense(u.spaceId, created.id, {
      spentAt: farFuture.toISOString().slice(0, 10),
    });
    expect(rejected).toBeNull();

    const [stored] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.id, created.id));
    expect(stored.spentAt).toBe(today);
  });
});

describe("expenses repository — shared space", () => {
  it("updateExpense to a category of another space returns null and keeps the row", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const foreign = await createCategory(b.spaceId, b.user.id, {
      name: "B-cat",
      color: CATEGORY_COLORS[0],
    });
    const exp = await mkExpense(a.spaceId, a.user.id);

    expect(
      await updateExpense(a.spaceId, exp.id, { categoryId: foreign.id }),
    ).toBeNull();
    expect((await getExpense(a.spaceId, exp.id))?.categoryId).toBe(
      exp.categoryId,
    );
  });

  it("a member reads, edits and deletes the owner's expenses", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const exp = await mkExpense(owner.spaceId, owner.user.id, {
      amountMinor: 5000,
    });

    expect((await listExpenses(member.spaceId, "RUB")).map((e) => e.id)).toEqual(
      [exp.id],
    );
    const updated = await updateExpense(member.spaceId, exp.id, {
      amountMinor: 6000,
    });
    expect(updated?.amountMinor).toBe(6000);
    expect(updated?.createdBy).toBe(owner.user.id);
    expect(await deleteExpense(member.spaceId, exp.id)).toEqual({ ok: true });
  });

  it("summary covers expenses of every member", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const cat = await createCategory(owner.spaceId, owner.user.id, {
      name: "Food",
      color: CATEGORY_COLORS[5],
    });
    await mkExpense(owner.spaceId, owner.user.id, {
      categoryId: cat.id,
      amountMinor: 1000,
    });
    await mkExpense(owner.spaceId, member.user.id, {
      categoryId: cat.id,
      amountMinor: 2500,
    });

    const result = await summary(owner.spaceId, "RUB", { from: today, to: today });
    expect(result.totalMinor).toBe(3500);
  });

  it("form hints are personal: each member gets their own last category and currency", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const food = await createCategory(owner.spaceId, owner.user.id, {
      name: "Food",
      color: CATEGORY_COLORS[0],
    });
    const taxi = await createCategory(owner.spaceId, owner.user.id, {
      name: "Taxi",
      color: CATEGORY_COLORS[1],
    });

    await mkExpense(owner.spaceId, owner.user.id, {
      categoryId: food.id,
      currency: "EUR",
    });
    await mkExpense(owner.spaceId, member.user.id, {
      categoryId: taxi.id,
      currency: "USD",
    });

    expect(await lastUsedCategoryId(owner.spaceId, owner.user.id)).toBe(food.id);
    expect(await lastUsedCurrency(owner.spaceId, owner.user.id)).toBe("EUR");
    expect(await lastUsedCategoryId(owner.spaceId, member.user.id)).toBe(taxi.id);
    expect(await lastUsedCurrency(owner.spaceId, member.user.id)).toBe("USD");

    const newcomer = await mkMember(owner.spaceId);
    expect(await lastUsedCategoryId(newcomer.spaceId, newcomer.user.id)).toBeNull();
    expect(await lastUsedCurrency(newcomer.spaceId, newcomer.user.id)).toBeNull();
  });
});
