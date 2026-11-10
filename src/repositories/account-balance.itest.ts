import { subDays } from "date-fns";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accounts, expenses } from "@/db/schema";
import type { SpaceId } from "@/lib/space-id";
import { deleteAccount, getAccount, listAccounts, updateAccount } from "@/repositories/accounts";
import {
  createExpense,
  deleteExpense,
  getExpense,
  lastUsedAccountId,
  updateExpense,
} from "@/repositories/expenses";
import { mkAccount, mkExpense, mkMember, mkSpaceUser } from "@/test/factories";

afterEach(() => {
  vi.restoreAllMocks();
});

const now = new Date();
const BEFORE_ANCHOR = subDays(now, 20);
const ANCHOR = subDays(now, 10);
const AFTER_ANCHOR = subDays(now, 5);

async function anchoredAccount(
  spaceId: SpaceId,
  userId: string,
  anchorAmountMinor: number,
  overrides: Partial<typeof accounts.$inferInsert> = {},
) {
  const account = await mkAccount(spaceId, userId, { anchorAmountMinor, ...overrides });
  await db.update(accounts).set({ anchorAt: ANCHOR }).where(eq(accounts.id, account.id));
  return account;
}

async function expenseAt(
  spaceId: SpaceId,
  userId: string,
  accountId: string,
  amountMinor: number,
  createdAt: Date,
) {
  const expense = await mkExpense(spaceId, userId, { accountId, amountMinor });
  await db.update(expenses).set({ createdAt }).where(eq(expenses.id, expense.id));
  return expense;
}

async function balance(spaceId: SpaceId, accountId: string): Promise<number | undefined> {
  return (await getAccount(spaceId, accountId))?.balanceMinor;
}

describe("account balance", () => {
  it("1. an expense after the anchor lowers the balance", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    await expenseAt(a.spaceId, a.user.id, account.id, 2500, AFTER_ANCHOR);

    expect(await balance(a.spaceId, account.id)).toBe(7500);
    const [listed] = await listAccounts(a.spaceId);
    expect(listed.balanceMinor).toBe(7500);

    await expenseAt(a.spaceId, a.user.id, account.id, 1000, AFTER_ANCHOR);
    await expenseAt(a.spaceId, a.user.id, account.id, 4000, BEFORE_ANCHOR);
    expect(await balance(a.spaceId, account.id)).toBe(6500);
  });

  it("1a. an expense of another space linked to the account is not counted", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const stray = await mkExpense(b.spaceId, b.user.id, { amountMinor: 2500 });
    await db
      .update(expenses)
      .set({ accountId: account.id, createdAt: AFTER_ANCHOR })
      .where(eq(expenses.id, stray.id));

    expect(await balance(a.spaceId, account.id)).toBe(10000);
  });

  it("2. editing the amount shifts the balance by the difference", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const expense = await expenseAt(a.spaceId, a.user.id, account.id, 2500, AFTER_ANCHOR);

    await updateExpense(a.spaceId, expense.id, { amountMinor: 4000 });
    expect(await balance(a.spaceId, account.id)).toBe(6000);
  });

  it("3. moving to another account restores the old one; the new one counts it only after its anchor", async () => {
    const a = await mkSpaceUser();
    const from = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const laterAnchored = await mkAccount(a.spaceId, a.user.id, { anchorAmountMinor: 5000 });
    await db.update(accounts).set({ anchorAt: subDays(now, 1) }).where(eq(accounts.id, laterAnchored.id));
    const earlierAnchored = await anchoredAccount(a.spaceId, a.user.id, 5000);
    const expense = await expenseAt(a.spaceId, a.user.id, from.id, 2500, AFTER_ANCHOR);

    await updateExpense(a.spaceId, expense.id, { accountId: laterAnchored.id });
    expect(await balance(a.spaceId, from.id)).toBe(10000);
    expect(await balance(a.spaceId, laterAnchored.id)).toBe(5000);

    await updateExpense(a.spaceId, expense.id, { accountId: earlierAnchored.id });
    expect(await balance(a.spaceId, laterAnchored.id)).toBe(5000);
    expect(await balance(a.spaceId, earlierAnchored.id)).toBe(2500);

    await updateExpense(a.spaceId, expense.id, { accountId: null });
    expect(await balance(a.spaceId, earlierAnchored.id)).toBe(5000);
  });

  it("4. deleting an expense restores the balance", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const expense = await expenseAt(a.spaceId, a.user.id, account.id, 2500, AFTER_ANCHOR);

    await deleteExpense(a.spaceId, expense.id);
    expect(await balance(a.spaceId, account.id)).toBe(10000);
  });

  it("5. an expense before the anchor counts for nothing, edited or deleted", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const expense = await expenseAt(a.spaceId, a.user.id, account.id, 2500, BEFORE_ANCHOR);
    expect(await balance(a.spaceId, account.id)).toBe(10000);

    await updateExpense(a.spaceId, expense.id, { amountMinor: 9000 });
    expect(await balance(a.spaceId, account.id)).toBe(10000);

    await deleteExpense(a.spaceId, expense.id);
    expect(await balance(a.spaceId, account.id)).toBe(10000);
  });

  it("6. deleting an account unlinks its expenses and keeps them", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const expense = await expenseAt(a.spaceId, a.user.id, account.id, 2500, AFTER_ANCHOR);

    expect(await deleteAccount(a.spaceId, account.id)).toEqual({ ok: true });
    const kept = await getExpense(a.spaceId, expense.id);
    expect(kept).not.toBeNull();
    expect(kept?.accountId).toBeNull();
  });

  it("7. rejects a mismatched currency, a foreign account and patches that break the pair", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const usd = await anchoredAccount(a.spaceId, a.user.id, 10000, { currency: "USD" });
    const rub = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const foreign = await anchoredAccount(b.spaceId, b.user.id, 10000);
    const base = await mkExpense(a.spaceId, a.user.id);

    expect(
      await createExpense(a.spaceId, a.user.id, {
        categoryId: base.categoryId,
        amountMinor: 1000,
        currency: "RUB",
        note: "тест",
        spentAt: base.spentAt,
        accountId: usd.id,
      }),
    ).toBeNull();
    expect(
      await createExpense(a.spaceId, a.user.id, {
        categoryId: base.categoryId,
        amountMinor: 1000,
        currency: "RUB",
        note: "тест",
        spentAt: base.spentAt,
        accountId: foreign.id,
      }),
    ).toBeNull();

    expect(await updateExpense(a.spaceId, base.id, { accountId: usd.id })).toBeNull();
    expect(await updateExpense(a.spaceId, base.id, { accountId: foreign.id })).toBeNull();

    const linked = await mkExpense(a.spaceId, a.user.id, { accountId: rub.id });
    expect(await updateExpense(a.spaceId, linked.id, { currency: "USD" })).toBeNull();
    expect((await getExpense(a.spaceId, linked.id))?.currency).toBe("RUB");
    expect((await getExpense(a.spaceId, base.id))?.accountId).toBeNull();

    const moved = await updateExpense(a.spaceId, linked.id, { currency: "USD", accountId: usd.id });
    expect(moved?.accountId).toBe(usd.id);

    const unlinked = await updateExpense(a.spaceId, linked.id, { accountId: null, currency: "EUR" });
    expect(unlinked).toMatchObject({ accountId: null, currency: "EUR" });

    const rejections = log.mock.calls.filter(([event]) => event === "expense.account_rejected");
    expect(rejections).toHaveLength(5);
  });

  it("7a. concurrent patches of the account and the currency never leave a mismatched pair", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const a = await mkSpaceUser();
    const rub = await anchoredAccount(a.spaceId, a.user.id, 10000);
    for (let i = 0; i < 10; i++) {
      const expense = await mkExpense(a.spaceId, a.user.id);
      await Promise.all([
        updateExpense(a.spaceId, expense.id, { currency: "USD" }),
        updateExpense(a.spaceId, expense.id, { accountId: rub.id }),
      ]);
      const row = await getExpense(a.spaceId, expense.id);
      if (row?.accountId) expect(row.currency).toBe(rub.currency);
    }
  });

  it("8. renaming with a stale loaded balance keeps the anchor; editing the value moves it", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 60000);
    await expenseAt(a.spaceId, a.user.id, account.id, 2500, AFTER_ANCHOR);
    expect(await balance(a.spaceId, account.id)).toBe(57500);

    const unchanged = await updateAccount(a.spaceId, account.id, {
      name: "Новое имя",
      balanceMinor: 58500,
      loadedBalanceMinor: 58500,
    });
    expect(unchanged?.name).toBe("Новое имя");
    expect(unchanged?.anchorAmountMinor).toBe(60000);
    expect(unchanged?.anchorAt).toEqual(ANCHOR);
    expect(unchanged?.balanceMinor).toBe(57500);

    const reanchored = await updateAccount(a.spaceId, account.id, {
      balanceMinor: 70000,
      loadedBalanceMinor: 58500,
    });
    expect(reanchored?.anchorAmountMinor).toBe(70000);
    expect(reanchored!.anchorAt.getTime()).toBeGreaterThan(ANCHOR.getTime());
    expect(reanchored?.balanceMinor).toBe(70000);
  });

  it("9. a balance below zero is computed", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 1000);
    await expenseAt(a.spaceId, a.user.id, account.id, 3500, AFTER_ANCHOR);

    expect(await balance(a.spaceId, account.id)).toBe(-2500);
  });

  it("10. lastUsedAccountId is per member and null once the account is gone", async () => {
    const a = await mkSpaceUser();
    const b = await mkMember(a.spaceId);
    const mine = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const theirs = await anchoredAccount(a.spaceId, a.user.id, 10000);
    expect(await lastUsedAccountId(a.spaceId, a.user.id)).toBeNull();

    await mkExpense(a.spaceId, a.user.id, { accountId: mine.id });
    await mkExpense(b.spaceId, b.user.id, { accountId: theirs.id });
    expect(await lastUsedAccountId(a.spaceId, a.user.id)).toBe(mine.id);
    expect(await lastUsedAccountId(a.spaceId, b.user.id)).toBe(theirs.id);

    await deleteAccount(a.spaceId, mine.id);
    expect(await lastUsedAccountId(a.spaceId, a.user.id)).toBeNull();
    expect(await lastUsedAccountId(a.spaceId, b.user.id)).toBe(theirs.id);
  });
});
