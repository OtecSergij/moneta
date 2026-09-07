import { addDays } from "date-fns";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { expenses, fxRates } from "@/db/schema";
import { CURRENCY_CODES, currencyMeta } from "@/lib/currency";
import { toISODate } from "@/lib/dates";
import {
  CATEGORY_COLORS,
  createCategory,
} from "@/repositories/categories";
import {
  ExpenseInput,
  createExpense,
  deleteExpense,
  lastUsedCategoryId,
  lastUsedChargedCurrency,
  listExpenses,
  summary,
  updateExpense,
} from "@/repositories/expenses";
import { repairPendingOverrides } from "@/repositories/fx-rates";
import { setDisplayCurrency } from "@/repositories/user-settings";
import { clearRates, mkExpense, mkRate, mkUser } from "@/test/factories";

const today = new Date().toISOString().slice(0, 10);

beforeEach(clearRates);

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

    const aList = await listExpenses(a.id, "RUB");
    const bList = await listExpenses(b.id, "RUB");
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

    const [stillThere] = await listExpenses(a.id, "RUB");
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
    expect(await listExpenses(a.id, "RUB")).toHaveLength(1);
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
    expect(await listExpenses(b.id, "RUB")).toEqual([]);
    expect(await listExpenses(a.id, "RUB")).toEqual([]);
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

    const aSummary = await summary(a.id, "RUB", { from: today, to: today });
    expect(aSummary.totalMinor).toBe(42000);
    expect(aSummary.byCategory).toHaveLength(1);
    expect(aSummary.byCategory[0].totalMinor).toBe(42000);
    expect(aSummary.byCategory[0].name).toBe("Food");

    const bSummary = await summary(b.id, "RUB", { from: today, to: today });
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

describe("lastUsedChargedCurrency", () => {
  // createExpense awaits ensureRates on the fixation path, so every row below
  // is created with a failing fetch stub: this function reads nothing but the
  // row's own charged_currency, so seeding rates would only be setup that
  // proves nothing.
  const offline = {
    fetch: vi.fn(async () => {
      throw new Error("lastUsedChargedCurrency needs no rates");
    }),
  };

  it("returns null until the user records a fixation", async () => {
    const u = await mkUser();
    expect(await lastUsedChargedCurrency(u.id)).toBeNull();

    // An expense without a charged pair isn't an answer to "which card".
    await mkExpense(u.id, { currency: "RSD", amountMinor: 300000 });
    expect(await lastUsedChargedCurrency(u.id)).toBeNull();
  });

  it("returns the most recently created fixation's currency, ignoring plain rows and other users", async () => {
    const u = await mkUser();
    const other = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Charged",
      color: CATEGORY_COLORS[3],
    });
    const otherCat = await createCategory(other.id, {
      name: "Charged other",
      color: CATEGORY_COLORS[4],
    });
    // Isolated from every other date cluster in this file; no rates are
    // seeded for them on purpose.
    const laterDate = "2025-12-08";
    const earlierDate = "2025-12-05";

    await createExpense(
      u.id,
      {
        categoryId: cat.id,
        amountMinor: 300000,
        currency: "RSD",
        chargedAmountMinor: 256,
        chargedCurrency: "EUR",
        note: "евро-карта",
        spentAt: laterDate,
      },
      offline,
    );
    // Created later but spent earlier — "last used" follows creation order.
    await createExpense(
      u.id,
      {
        categoryId: cat.id,
        amountMinor: 100000,
        currency: "RSD",
        chargedAmountMinor: 900,
        chargedCurrency: "USD",
        note: "долларовая карта",
        spentAt: earlierDate,
      },
      offline,
    );
    // A later expense without a fixation must not erase the answer.
    await mkExpense(u.id, { categoryId: cat.id, currency: "RSD" });
    // Another user's later fixation must not leak into u's result.
    await createExpense(
      other.id,
      {
        categoryId: otherCat.id,
        amountMinor: 100000,
        currency: "RSD",
        chargedAmountMinor: 90000,
        chargedCurrency: "RUB",
        note: "чужая карта",
        spentAt: earlierDate,
      },
      offline,
    );

    expect(await lastUsedChargedCurrency(u.id)).toBe("USD");
    expect(await lastUsedChargedCurrency(other.id)).toBe("RUB");
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

describe("listExpenses — rate selection uses the row's own date (AC-9)", () => {
  it("converts using the rate on file for the row's own spentAt, not a later rate for the same currency", async () => {
    const u = await mkUser();
    const earlyDate = "2025-04-10";
    const lateDate = "2025-05-25"; // 45 days later — outside every lookup window

    await mkRate({ currency: "RUB", effectiveDate: earlyDate, rateToUsd: "0.01050000000000000000" });
    await mkRate({ currency: "RUB", effectiveDate: lateDate, rateToUsd: "0.01300000000000000000" });
    await mkRate({ currency: "USD", effectiveDate: earlyDate, rateToUsd: "1.00000000000000000000" });

    const created = await mkExpense(u.id, {
      amountMinor: 500000, // 5000.00 RUB
      currency: "RUB",
      spentAt: earlyDate,
    });

    // The range spans both rate dates so the later RUB rate is actually
    // loaded into the index — otherwise loadRateIndex's own `to` bound would
    // exclude it and the test wouldn't prove anything.
    const rows = await listExpenses(u.id, "USD", { from: earlyDate, to: lateDate });
    const row = rows.find((r) => r.id === created.id);
    expect(row).toBeDefined();

    // 5000 RUB * 0.0105 USD/RUB = 52.50 USD = 5250 cents — the early rate.
    // The later rate (0.013) would give 6500 instead.
    expect(row!.convertedMinor).toBe(5250);
  });
});

describe("display currency switch — expenses rows are untouched (AC-10)", () => {
  it("leaves every expenses column byte-identical while summary output changes", async () => {
    const u = await mkUser();
    const date = "2025-07-15";
    await mkRate({ currency: "USD", effectiveDate: date, rateToUsd: "1.00000000000000000000" });
    await mkRate({ currency: "RUB", effectiveDate: date, rateToUsd: "0.01050000000000000000" });

    await setDisplayCurrency(u.id, "USD");
    await mkExpense(u.id, { amountMinor: 10000, currency: "USD", spentAt: date });

    const before = await db.select().from(expenses).where(eq(expenses.userId, u.id));
    const summaryUSD = await summary(u.id, "USD", { from: date, to: date });
    expect(summaryUSD.totalMinor).toBe(10000); // identity: shown in its own currency

    await setDisplayCurrency(u.id, "RUB");
    const after = await db.select().from(expenses).where(eq(expenses.userId, u.id));
    expect(after).toEqual(before);

    const summaryRUB = await summary(u.id, "RUB", { from: date, to: date });
    expect(summaryRUB.totalMinor).not.toBe(summaryUSD.totalMinor);
  });
});

describe("RUB-only history in RUB — identity needs no fx_rates (AC-16)", () => {
  it("totals correctly and is never marked approximate with fx_rates empty for the date", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Groceries",
      color: CATEGORY_COLORS[0],
    });
    const date = "2025-09-01";

    await mkExpense(u.id, { categoryId: cat.id, amountMinor: 30000, currency: "RUB", spentAt: date });
    await mkExpense(u.id, { categoryId: cat.id, amountMinor: 15000, currency: "RUB", spentAt: date });

    const result = await summary(u.id, "RUB", { from: date, to: date });
    expect(result.totalMinor).toBe(45000);
    expect(result.byCategory).toHaveLength(1);
    expect(result.byCategory[0]).toMatchObject({ totalMinor: 45000 });
  });
});

describe("BTC amounts beyond INTEGER range (AC-17)", () => {
  it("stores, reads back, and sums 25 BTC exactly without overflow", async () => {
    const u = await mkUser();
    const date = "2025-10-20";
    const amountMinor = 2_500_000_000; // 25 BTC in satoshi — above INTEGER's ~2.1e9 ceiling

    const created = await mkExpense(u.id, { amountMinor, currency: "BTC", spentAt: date });
    expect(created.amountMinor).toBe(amountMinor);

    const [reread] = await listExpenses(u.id, "BTC", { categoryId: created.categoryId });
    expect(reread.amountMinor).toBe(amountMinor);
    expect(reread.convertedMinor).toBe(amountMinor); // identity: BTC shown in BTC

    await mkRate({ currency: "BTC", effectiveDate: date, rateToUsd: "65000.00000000000000000000" });
    await mkRate({ currency: "RUB", effectiveDate: date, rateToUsd: "0.01050000000000000000" });

    const result = await summary(u.id, "RUB", { from: date, to: date });
    expect(result.totalMinor).toBeGreaterThan(0);
    expect(Number.isSafeInteger(result.totalMinor)).toBe(true);
  });
});

describe("createExpense — 'today' tolerates a client one day ahead of the server (timezone boundary)", () => {
  it("still applies the live BTC rate when spentAt is tomorrow in server time", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Crypto tz",
      color: CATEGORY_COLORS[4],
    });
    // The browser can legitimately compute "today" as one day ahead of this
    // server's clock (e.g. Serbia, UTC+1/2, vs. a UTC server) — isCurrentDate
    // widens "today" to cover it (src/lib/fx/provider.ts). Before that fix,
    // this spentAt would miss both the live-BTC branch and quoteConversionAction's
    // validation bound.
    const tomorrow = toISODate(addDays(new Date(), 1));
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { rates: { USD: "65000.12" } } }), {
          status: 200,
        }),
    );

    const result = await createExpense(
      u.id,
      {
        categoryId: cat.id,
        amountMinor: 100000,
        currency: "BTC",
        note: "тест",
        spentAt: tomorrow,
      },
      { fetch },
    );

    expect(result).not.toBeNull();
    expect(result!.rateSource).toBe("coinbase");
    expect(Number(result!.rateToUsdOverride)).toBeCloseTo(65000.12, 6);
  });
});

describe("createExpense — provider unavailable (AC-22)", () => {
  it("still saves the expense with a null override when the provider throws", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Provider down",
      color: CATEGORY_COLORS[6],
    });
    // Isolated date, far from every other cluster in this file — the point
    // is "no rate available", so nothing else may seed fx_rates nearby.
    // Must be in the past: createExpense bounds spentAt by maxEntryDate().
    const date = "2024-11-20";
    const fetch = vi.fn(async () => {
      throw new Error("network down");
    });

    const result = await createExpense(
      u.id,
      {
        categoryId: cat.id,
        currency: "USD",
        amountMinor: 10000,
        chargedAmountMinor: 900000,
        chargedCurrency: "RUB",
        note: "тест",
        spentAt: date,
      },
      { fetch },
    );

    expect(result).not.toBeNull();
    expect(result!.chargedAmountMinor).toBe(900000);
    expect(result!.chargedCurrency).toBe("RUB");
    expect(result!.rateToUsdOverride).toBeNull();
    expect(result!.rateSource).toBeNull();
  });
});

describe("read paths never touch the network (AC-23)", () => {
  it("summary() and listExpenses() do not throw when fetch is broken, over mixed-currency data", async () => {
    const u = await mkUser();
    const date = "2026-01-25";
    await mkRate({ currency: "USD", effectiveDate: date, rateToUsd: "1.00000000000000000000" });
    await mkRate({ currency: "RUB", effectiveDate: date, rateToUsd: "0.01050000000000000000" });
    // BTC's rate is deliberately left unseeded, so this also exercises the
    // "no rate available" branch alongside the converted ones — without
    // either branch throwing.
    await mkExpense(u.id, { amountMinor: 10000, currency: "RUB", spentAt: date });
    await mkExpense(u.id, { amountMinor: 5000, currency: "USD", spentAt: date });
    await mkExpense(u.id, { amountMinor: 100000, currency: "BTC", spentAt: date });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("a read path must never call fetch");
    }) as unknown as typeof globalThis.fetch;

    try {
      const list = await listExpenses(u.id, "RUB", { from: date, to: date });
      expect(list).toHaveLength(3);

      const result = await summary(u.id, "RUB", { from: date, to: date });
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

describe("updateExpense — frozen rate preservation (AC-26)", () => {
  it("'coinbase' row: a note edit and an amount edit both leave the rate frozen", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Crypto",
      color: CATEGORY_COLORS[4],
    });
    const [row] = await db
      .insert(expenses)
      .values({
        userId: u.id,
        categoryId: cat.id,
        amountMinor: 100000,
        currency: "BTC",
        note: "покупка кофе",
        spentAt: "2026-03-15",
        rateToUsdOverride: "65000.00000000000000000000",
        rateSource: "coinbase",
      })
      .returning();

    const afterNote = await updateExpense(u.id, row.id, { note: "правка описания" });
    expect(afterNote!.rateToUsdOverride).toBe(row.rateToUsdOverride);
    expect(afterNote!.rateSource).toBe("coinbase");

    const afterAmount = await updateExpense(u.id, row.id, { amountMinor: 200000 });
    expect(afterAmount!.rateToUsdOverride).toBe(row.rateToUsdOverride);
    expect(afterAmount!.rateSource).toBe("coinbase");
  });

  it("'user' row: a note edit leaves the rate frozen, but an amount edit re-derives it", async () => {
    const u = await mkUser();
    const date = "2026-03-15";
    for (const currency of CURRENCY_CODES) {
      await mkRate({ currency, effectiveDate: date, rateToUsd: "1.00000000000000000000" });
    }

    const created = await mkExpense(u.id, {
      currency: "USD",
      amountMinor: 10000,
      chargedAmountMinor: 900000,
      chargedCurrency: "RUB",
      spentAt: date,
    });
    expect(created.rateSource).toBe("user");
    expect(created.rateToUsdOverride).not.toBeNull();
    const originalOverride = created.rateToUsdOverride;

    const afterNote = await updateExpense(u.id, created.id, { note: "правка описания" });
    expect(afterNote!.rateToUsdOverride).toBe(originalOverride);
    expect(afterNote!.rateSource).toBe("user");

    const afterAmount = await updateExpense(u.id, created.id, { amountMinor: 20000 });
    expect(afterAmount!.rateSource).toBe("user");
    expect(afterAmount!.rateToUsdOverride).not.toBeNull();
    expect(afterAmount!.rateToUsdOverride).not.toBe(originalOverride);
  });
});

describe("updateExpense — re-derivation awaits ensureRates instead of reading a possibly-empty table", () => {
  it("derives the override for a re-derivation trigger even when the new date has no rate yet", async () => {
    const u = await mkUser();
    const seededDate = "2026-07-01";
    for (const currency of CURRENCY_CODES) {
      await mkRate({ currency, effectiveDate: seededDate, rateToUsd: "1.00000000000000000000" });
    }
    const created = await mkExpense(u.id, {
      currency: "USD",
      amountMinor: 10000,
      chargedAmountMinor: 900000,
      chargedCurrency: "RUB",
      spentAt: seededDate,
    });
    expect(created.rateSource).toBe("user");

    // A fresh date with nothing in fx_rates yet — only ensureRates (called
    // with a working fetch stub) can populate it before derivation reads it
    // back. Before this fix, updateExpense's 'user'-branch derivation never
    // called ensureRates, so this would have landed on a null override
    // regardless of whether the provider could have supplied a rate.
    const newDate = "2026-07-05";
    const fetch = vi.fn(
      async () =>
        new Response(
          '{"usd":{"usd":1,"rub":96.5,"eur":0.923,"rsd":107.7,"btc":1.2692964e-05}}',
          { status: 200 },
        ),
    );

    const updated = await updateExpense(
      u.id,
      created.id,
      { spentAt: newDate },
      { fetch },
    );

    expect(updated!.rateSource).toBe("user");
    expect(updated!.rateToUsdOverride).not.toBeNull();

    const [rubRate] = await db
      .select()
      .from(fxRates)
      .where(and(eq(fxRates.currency, "RUB"), eq(fxRates.effectiveDate, newDate)));
    expect(rubRate).toBeDefined();
  });
});

describe("updateExpense — a live Coinbase rate does not survive a date change", () => {
  it("drops the frozen rate so the row falls to the daily snapshot of its new date", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Crypto redated",
      color: CATEGORY_COLORS[4],
    });
    const created = "2026-02-15"; // own cluster, weeks from every other one here
    const moved = "2026-02-16";
    await mkRate({ currency: "BTC", effectiveDate: moved, rateToUsd: "60000.00000000000000000000" });
    await mkRate({ currency: "RUB", effectiveDate: moved, rateToUsd: "0.01000000000000000000" });

    const [row] = await db
      .insert(expenses)
      .values({
        userId: u.id,
        categoryId: cat.id,
        amountMinor: 100000, // 0.001 BTC
        currency: "BTC",
        note: "кофе",
        spentAt: created,
        rateToUsdOverride: "65000.00000000000000000000",
        rateSource: "coinbase",
      })
      .returning();

    // The live quote asserted a price at the moment of purchase; moving the
    // date invalidates the assertion, and keeping it would freeze the entry
    // day's price onto another day — the very thing AC-7 refuses to do for a
    // back-dated create.
    const updated = await updateExpense(u.id, row.id, { spentAt: moved });
    expect(updated!.rateToUsdOverride).toBeNull();
    expect(updated!.rateSource).toBeNull();

    const [reread] = await listExpenses(u.id, "RUB", { from: moved, to: moved });
    // 0.001 BTC * 60 000 = $60 -> /0.01 = 6 000 ₽. The frozen 65 000 would
    // have given 6 500 ₽.
    expect(reread.convertedMinor).toBe(600000);
  });
});

describe("updateExpense — a new fixation overrides a live Coinbase rate (AC-6)", () => {
  it("re-derives from the charged pair and switches rate_source to 'user' on a 'coinbase' row", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Crypto fix",
      color: CATEGORY_COLORS[4],
    });
    const date = "2026-07-10";
    for (const currency of CURRENCY_CODES) {
      await mkRate({
        currency,
        effectiveDate: date,
        rateToUsd: currency === "RUB" ? "0.01000000000000000000" : "1.00000000000000000000",
      });
    }

    const [row] = await db
      .insert(expenses)
      .values({
        userId: u.id,
        categoryId: cat.id,
        amountMinor: 100000, // 0.001 BTC
        currency: "BTC",
        note: "кофе",
        spentAt: date,
        rateToUsdOverride: "65000.00000000000000000000",
        rateSource: "coinbase",
      })
      .returning();

    // Adding «списано 30 000 ₽» to the existing BTC row — before this fix,
    // the coinbase branch only cleared the rate when currency left BTC, so
    // this would have left rate_source: 'coinbase' with the charged pair
    // stored but ignored in every other display currency.
    const updated = await updateExpense(u.id, row.id, {
      chargedAmountMinor: 3_000_000, // 30 000 ₽
      chargedCurrency: "RUB",
    });

    expect(updated!.rateSource).toBe("user");
    expect(updated!.rateToUsdOverride).not.toBe(row.rateToUsdOverride);
    // override = (3000000/100) * 0.01 / (100000/1e8) = 30000*0.01/0.001 = 300000
    expect(Number(updated!.rateToUsdOverride)).toBe(300000);
  });
});

describe("createExpense + repairPendingOverrides — manual fixation lifecycle (AC-27)", () => {
  it("saves with a null override when no rate is available yet, then repairs it once the rate exists", async () => {
    const u = await mkUser();
    // Own cluster, so it doesn't share fx_rates state with AC-22. The
    // sources are unreachable by stub rather than by a date below their
    // history floor: the official fiat sources reach back to 2003, so no
    // realistic date is "before history" any more — and a stub is the
    // precondition AC-27 actually describes.
    const date = "2024-07-15";
    const offline = {
      fetch: vi.fn(async () => {
        throw new Error("no provider for this test");
      }),
    };

    const created = await mkExpense(
      u.id,
      {
        currency: "EUR",
        amountMinor: 5000,
        chargedAmountMinor: 450000,
        chargedCurrency: "RUB",
        spentAt: date,
      },
      offline,
    );
    expect(created.rateToUsdOverride).toBeNull();
    expect(created.rateSource).toBeNull();

    // The rate becomes available later — repairPendingOverrides only cares
    // whether fx_rates has it now, not about any history floor.
    await mkRate({ currency: "RUB", effectiveDate: date, rateToUsd: "0.01200000000000000000" });

    const repaired = await repairPendingOverrides(u.id);
    expect(repaired).toBe(1);

    const [updated] = await db.select().from(expenses).where(eq(expenses.id, created.id));
    expect(updated.rateSource).toBe("user");
    // override = (450000/100) * 0.012 / (5000/100) = 4500 * 0.012 / 50 = 1.08
    expect(Number(updated.rateToUsdOverride)).toBeCloseTo(1.08, 8);
  });
});

describe("createExpense / updateExpense — cross-field validation on effective values", () => {
  it("createExpense rejects a charged pair fixed in the expense's own currency", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Same currency",
      color: CATEGORY_COLORS[0],
    });

    // { currency: "RUB", chargedCurrency: "RUB" } — each field is
    // individually valid per zod, so only a cross-field check catches this
    // before it would hit the expenses_charged_currency_differs CHECK.
    const result = await createExpense(u.id, {
      categoryId: cat.id,
      amountMinor: 10000,
      currency: "RUB",
      chargedAmountMinor: 9000,
      chargedCurrency: "RUB",
      note: "тест",
      spentAt: today,
    });

    expect(result).toBeNull();
  });

  it("updateExpense rejects setting exactly one side of the charged pair", async () => {
    const u = await mkUser();
    const created = await mkExpense(u.id, { currency: "USD", amountMinor: 10000 });

    // { chargedAmountMinor: 100 } alone — ExpensePatch validates it in
    // isolation, so only comparing it against the row's (null) chargedCurrency
    // catches the mismatched pair.
    const result = await updateExpense(u.id, created.id, { chargedAmountMinor: 100 });

    expect(result).toBeNull();
    const [unchanged] = await db.select().from(expenses).where(eq(expenses.id, created.id));
    expect(unchanged.chargedAmountMinor).toBeNull();
  });
});

describe("createExpense — an absurd fixation derives a rate outside the sane band", () => {
  it("rejects the derivation and leaves the override null instead of writing an out-of-range numeric", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
      name: "Absurd",
      color: CATEGORY_COLORS[5],
    });
    const date = "2026-08-10";
    for (const currency of CURRENCY_CODES) {
      await mkRate({ currency, effectiveDate: date, rateToUsd: "1.00000000000000000000" });
    }

    // A tiny entered amount against a huge (but individually valid) charged
    // amount implies a rate of 9e11 — far outside the 1e-9…1e9 band
    // numeric(36,20) is sanity-checked against.
    const result = await createExpense(u.id, {
      categoryId: cat.id,
      amountMinor: 1, // 0,01 ₽
      currency: "RUB",
      chargedAmountMinor: 900_000_000_000, // $9 000 000 000,00
      chargedCurrency: "USD",
      note: "тест",
      spentAt: date,
    });

    expect(result).not.toBeNull();
    expect(result!.chargedAmountMinor).toBe(900_000_000_000);
    expect(result!.rateToUsdOverride).toBeNull();
    expect(result!.rateSource).toBeNull();
  });
});

describe("summary — category totals reconcile with the period total (AC-29)", () => {
  it("keeps |period total - sum of category totals| within ceil(N/2) display units, across all five display currencies", async () => {
    const u = await mkUser();
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
        await createCategory(u.id, {
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
          await mkExpense(u.id, {
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
      const result = await summary(u.id, display, { from: date, to: date });
      expect(result.byCategory.length).toBe(6);

      const sumOfCategories = result.byCategory.reduce((s, c) => s + c.totalMinor, 0);
      const meta = currencyMeta(display);
      const unit = 10 ** (meta.exponent - meta.displayDigits);
      const tolerance = Math.ceil(result.byCategory.length / 2) * unit;

      expect(Math.abs(result.totalMinor - sumOfCategories)).toBeLessThanOrEqual(tolerance);
    }
  });
});

describe("updateExpense — clearing a fixation (AC-30)", () => {
  it("nulls charged_amount_minor, charged_currency, rate_to_usd_override and rate_source together", async () => {
    const u = await mkUser();
    const date = "2026-06-20";
    for (const currency of CURRENCY_CODES) {
      await mkRate({ currency, effectiveDate: date, rateToUsd: "1.00000000000000000000" });
    }

    const created = await mkExpense(u.id, {
      currency: "USD",
      amountMinor: 10000,
      chargedAmountMinor: 900000,
      chargedCurrency: "RUB",
      spentAt: date,
    });
    expect(created.rateSource).toBe("user");
    expect(created.rateToUsdOverride).not.toBeNull();

    const cleared = await updateExpense(u.id, created.id, {
      chargedAmountMinor: null,
      chargedCurrency: null,
    });

    expect(cleared!.chargedAmountMinor).toBeNull();
    expect(cleared!.chargedCurrency).toBeNull();
    expect(cleared!.rateToUsdOverride).toBeNull();
    expect(cleared!.rateSource).toBeNull();
  });
});

describe("createExpense — entry date bound", () => {
  it("rejects a date beyond one day ahead of the server", async () => {
    const u = await mkUser();
    const cat = await createCategory(u.id, {
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
    const rejected = await createExpense(u.id, {
      ...base,
      spentAt: farFuture.toISOString().slice(0, 10),
    });
    expect(rejected).toBeNull();

    // One day ahead is allowed: a client east of the server legitimately
    // reports tomorrow's date as its today.
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const accepted = await createExpense(
      u.id,
      { ...base, spentAt: tomorrow.toISOString().slice(0, 10) },
      {
        fetch: (async () => {
          throw new Error("offline");
        }) as unknown as typeof globalThis.fetch,
      },
    );
    expect(accepted).not.toBeNull();
  });
});
