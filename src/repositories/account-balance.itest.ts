import { subDays } from "date-fns";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accounts, expenses, topUps } from "@/db/schema";
import { toISODate } from "@/lib/dates";
import type { SpaceId } from "@/lib/space-id";
import { deleteAccount, getAccount, listAccounts, updateAccount } from "@/repositories/accounts";
import {
  ExpenseInput,
  ExpensePatch,
  createExpense,
  deleteExpense,
  getExpense,
  lastUsedIds,
  updateExpense,
} from "@/repositories/expenses";
import { deleteTopUp, getTopUp, updateTopUp } from "@/repositories/top-ups";
import { deleteTransfer, updateTransferAmount } from "@/repositories/transfers";
import {
  mkAccount,
  mkExpense,
  mkMember,
  mkSpaceUser,
  mkTopUp,
  mkTransfer,
} from "@/test/factories";

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

async function topUpAt(
  spaceId: SpaceId,
  userId: string,
  accountId: string,
  amountMinor: number,
  createdAt: Date,
  occurredOn: string = toISODate(createdAt),
) {
  const topUp = await mkTopUp(spaceId, userId, { accountId, amountMinor, occurredOn });
  await db.update(topUps).set({ createdAt }).where(eq(topUps.id, topUp.id));
  return topUp;
}

async function transferAt(
  spaceId: SpaceId,
  userId: string,
  fromAccountId: string,
  toAccountId: string,
  fromAmountMinor: number,
  toAmountMinor: number,
  createdAt: Date,
  enteredOn: string = toISODate(createdAt),
) {
  return mkTransfer(spaceId, userId, {
    fromAccountId,
    toAccountId,
    fromAmountMinor,
    toAmountMinor,
    createdAt,
    enteredOn,
  });
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
    expect(listed).toMatchObject({ balanceMinor: 7500, expenseCount: 1 });

    await expenseAt(a.spaceId, a.user.id, account.id, 1000, AFTER_ANCHOR);
    await expenseAt(a.spaceId, a.user.id, account.id, 4000, BEFORE_ANCHOR);
    expect(await balance(a.spaceId, account.id)).toBe(6500);
    expect((await getAccount(a.spaceId, account.id))?.expenseCount).toBe(3);
  });

  it("1a. the database refuses to link an expense to another space's account", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const stray = await mkExpense(b.spaceId, b.user.id, { amountMinor: 2500 });
    await expect(
      db
        .update(expenses)
        .set({ accountId: account.id, createdAt: AFTER_ANCHOR })
        .where(eq(expenses.id, stray.id)),
    ).rejects.toMatchObject({ cause: { code: "23503" } });

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

    await updateExpense(a.spaceId, expense.id, { accountId: from.id });
    expect(await balance(a.spaceId, earlierAnchored.id)).toBe(5000);
    expect(await balance(a.spaceId, from.id)).toBe(7500);
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

  it("6. an account with expenses cannot be deleted; its expenses and balance stay", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const expense = await expenseAt(a.spaceId, a.user.id, account.id, 2500, AFTER_ANCHOR);

    expect(await deleteAccount(a.spaceId, account.id)).toEqual({
      ok: false,
      reason: "has_expenses",
    });
    expect((await getExpense(a.spaceId, expense.id))?.accountId).toBe(account.id);
    expect(await balance(a.spaceId, account.id)).toBe(7500);
  });

  it("6a. an account without expenses is deleted", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const other = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const kept = await expenseAt(a.spaceId, a.user.id, other.id, 2500, AFTER_ANCHOR);

    expect(await deleteAccount(a.spaceId, account.id)).toEqual({ ok: true });
    expect(await getAccount(a.spaceId, account.id)).toBeNull();
    expect((await getExpense(a.spaceId, kept.id))?.accountId).toBe(other.id);
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
    expect((await getExpense(a.spaceId, base.id))?.accountId).toBe(rub.id);

    const moved = await updateExpense(a.spaceId, linked.id, { currency: "USD", accountId: usd.id });
    expect(moved?.accountId).toBe(usd.id);

    expect(
      ExpenseInput.safeParse({
        categoryId: base.categoryId,
        amountMinor: 1000,
        currency: "RUB",
        note: "тест",
        spentAt: base.spentAt,
      }).success,
    ).toBe(false);
    expect(ExpensePatch.safeParse({ accountId: null }).success).toBe(false);

    const rejections = log.mock.calls.filter(([event]) => event === "expense.account_rejected");
    expect(rejections).toHaveLength(5);
  });

  it("7a. concurrent patches of the account and the currency never leave a mismatched pair", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const a = await mkSpaceUser();
    const rub = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const usd = await anchoredAccount(a.spaceId, a.user.id, 10000, { currency: "USD" });
    for (let i = 0; i < 10; i++) {
      const expense = await mkExpense(a.spaceId, a.user.id, { accountId: rub.id });
      await Promise.all([
        updateExpense(a.spaceId, expense.id, { currency: "USD" }),
        updateExpense(a.spaceId, expense.id, { accountId: usd.id }),
        updateExpense(a.spaceId, expense.id, { accountId: usd.id, currency: "USD" }),
        updateExpense(a.spaceId, expense.id, { accountId: rub.id, currency: "RUB" }),
      ]);
      const row = await getExpense(a.spaceId, expense.id);
      expect(row?.currency).toBe(row?.accountId === usd.id ? "USD" : "RUB");
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

  it("9a. a balance past the exact integer range is an error, not an imprecise number", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 2);
    await topUpAt(a.spaceId, a.user.id, account.id, Number.MAX_SAFE_INTEGER, AFTER_ANCHOR);

    await expect(getAccount(a.spaceId, account.id)).rejects.toThrow(/out of range/);
    await expect(listAccounts(a.spaceId)).rejects.toThrow(/out of range/);
  });

  it("9b. sums past the exact range that cancel out still give the exact balance", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 2);
    const other = await anchoredAccount(a.spaceId, a.user.id, 0);
    await topUpAt(a.spaceId, a.user.id, account.id, Number.MAX_SAFE_INTEGER, AFTER_ANCHOR);
    await transferAt(
      a.spaceId,
      a.user.id,
      account.id,
      other.id,
      Number.MAX_SAFE_INTEGER,
      1,
      AFTER_ANCHOR,
    );

    expect(await balance(a.spaceId, account.id)).toBe(2);
    expect(await listAccounts(a.spaceId)).toMatchObject([
      { id: account.id, balanceMinor: 2 },
      { id: other.id, balanceMinor: 1 },
    ]);
  });

  it("10. the last used account is per member and null once the member has no expenses", async () => {
    const a = await mkSpaceUser();
    const b = await mkMember(a.spaceId);
    const mine = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const theirs = await anchoredAccount(a.spaceId, a.user.id, 10000);
    expect(await lastUsedIds(a.spaceId, a.user.id)).toBeNull();

    const spent = await mkExpense(a.spaceId, a.user.id, { accountId: mine.id });
    await mkExpense(b.spaceId, b.user.id, { accountId: theirs.id });
    expect((await lastUsedIds(a.spaceId, a.user.id))?.accountId).toBe(mine.id);
    expect((await lastUsedIds(a.spaceId, b.user.id))?.accountId).toBe(theirs.id);

    await deleteExpense(a.spaceId, spent.id);
    expect(await deleteAccount(a.spaceId, mine.id)).toEqual({ ok: true });
    expect(await lastUsedIds(a.spaceId, a.user.id)).toBeNull();
    expect((await lastUsedIds(a.spaceId, b.user.id))?.accountId).toBe(theirs.id);
  });

  it("11. a top-up after the anchor raises the balance", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    await topUpAt(a.spaceId, a.user.id, account.id, 2500, AFTER_ANCHOR);

    expect(await balance(a.spaceId, account.id)).toBe(12500);
    const [listed] = await listAccounts(a.spaceId);
    expect(listed).toMatchObject({ balanceMinor: 12500, expenseCount: 0 });
  });

  it("11a. a back-dated top-up entered after the anchor still counts", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    await topUpAt(
      a.spaceId,
      a.user.id,
      account.id,
      2500,
      AFTER_ANCHOR,
      toISODate(BEFORE_ANCHOR),
    );

    expect(await balance(a.spaceId, account.id)).toBe(12500);
  });

  it("12. a top-up before the anchor counts for nothing, edited or deleted", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const topUp = await topUpAt(a.spaceId, a.user.id, account.id, 2500, AFTER_ANCHOR);
    expect(await balance(a.spaceId, account.id)).toBe(12500);

    const reanchored = await updateAccount(a.spaceId, account.id, {
      balanceMinor: 20000,
      loadedBalanceMinor: 12500,
    });
    expect(reanchored?.balanceMinor).toBe(20000);

    await updateTopUp(a.spaceId, topUp.id, { amountMinor: 9000 });
    expect(await balance(a.spaceId, account.id)).toBe(20000);

    await deleteTopUp(a.spaceId, topUp.id);
    expect(await balance(a.spaceId, account.id)).toBe(20000);
  });

  it("13. expenses and top-ups together: each sum counted once", async () => {
    const a = await mkSpaceUser();
    const first = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const second = await anchoredAccount(a.spaceId, a.user.id, 5000);
    await expenseAt(a.spaceId, a.user.id, first.id, 1000, AFTER_ANCHOR);
    await expenseAt(a.spaceId, a.user.id, first.id, 2000, AFTER_ANCHOR);
    await topUpAt(a.spaceId, a.user.id, first.id, 300, AFTER_ANCHOR);
    await topUpAt(a.spaceId, a.user.id, first.id, 400, AFTER_ANCHOR);
    await topUpAt(a.spaceId, a.user.id, first.id, 500, AFTER_ANCHOR);
    await topUpAt(a.spaceId, a.user.id, second.id, 700, AFTER_ANCHOR);

    const expectedFirst = { balanceMinor: 10000 - 3000 + 1200, expenseCount: 2 };
    const expectedSecond = { balanceMinor: 5700, expenseCount: 0 };
    expect(await getAccount(a.spaceId, first.id)).toMatchObject(expectedFirst);
    expect(await getAccount(a.spaceId, second.id)).toMatchObject(expectedSecond);
    expect(await listAccounts(a.spaceId)).toMatchObject([
      { id: first.id, ...expectedFirst },
      { id: second.id, ...expectedSecond },
    ]);
  });

  it("14. editing a top-up's amount shifts the balance by the difference; deleting restores it", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const topUp = await topUpAt(a.spaceId, a.user.id, account.id, 2500, AFTER_ANCHOR);

    await updateTopUp(a.spaceId, topUp.id, { amountMinor: 4000 });
    expect(await balance(a.spaceId, account.id)).toBe(14000);

    expect(await deleteTopUp(a.spaceId, topUp.id)).toEqual({ ok: true });
    expect(await balance(a.spaceId, account.id)).toBe(10000);
  });

  it("15. deleting an account without expenses deletes its top-ups and nothing else", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const other = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const gone = await topUpAt(a.spaceId, a.user.id, account.id, 2500, AFTER_ANCHOR);
    const kept = await topUpAt(a.spaceId, a.user.id, other.id, 2500, AFTER_ANCHOR);
    const keptExpense = await expenseAt(a.spaceId, a.user.id, other.id, 1000, AFTER_ANCHOR);

    expect(await deleteAccount(a.spaceId, account.id)).toEqual({ ok: true });
    expect(await getTopUp(a.spaceId, gone.id)).toBeNull();
    expect(await getTopUp(a.spaceId, kept.id)).not.toBeNull();
    expect(await getExpense(a.spaceId, keptExpense.id)).not.toBeNull();
    expect(await balance(a.spaceId, other.id)).toBe(11500);
  });

  it("16. an account with expenses and top-ups cannot be deleted; nothing is removed", async () => {
    const a = await mkSpaceUser();
    const account = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const expense = await expenseAt(a.spaceId, a.user.id, account.id, 1000, AFTER_ANCHOR);
    const topUp = await topUpAt(a.spaceId, a.user.id, account.id, 2500, AFTER_ANCHOR);

    expect(await deleteAccount(a.spaceId, account.id)).toEqual({
      ok: false,
      reason: "has_expenses",
    });
    expect(await getExpense(a.spaceId, expense.id)).not.toBeNull();
    expect(await getTopUp(a.spaceId, topUp.id)).not.toBeNull();
    expect(await balance(a.spaceId, account.id)).toBe(11500);
  });

  it("17. a transfer after both anchors lowers the source by the debit and raises the target by the credit", async () => {
    const a = await mkSpaceUser();
    const usd = await anchoredAccount(a.spaceId, a.user.id, 50000, { currency: "USD" });
    const eur = await anchoredAccount(a.spaceId, a.user.id, 20000, { currency: "EUR" });
    await transferAt(a.spaceId, a.user.id, usd.id, eur.id, 10000, 9200, AFTER_ANCHOR);

    expect(await balance(a.spaceId, usd.id)).toBe(40000);
    expect(await balance(a.spaceId, eur.id)).toBe(29200);
    expect(await listAccounts(a.spaceId)).toMatchObject([
      { id: usd.id, balanceMinor: 40000 },
      { id: eur.id, balanceMinor: 29200 },
    ]);
  });

  it("18. each account compares a transfer with its own anchor", async () => {
    const a = await mkSpaceUser();
    const source = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const target = await anchoredAccount(a.spaceId, a.user.id, 5000);
    await transferAt(a.spaceId, a.user.id, source.id, target.id, 1000, 1000, AFTER_ANCHOR);
    expect(await balance(a.spaceId, source.id)).toBe(9000);
    expect(await balance(a.spaceId, target.id)).toBe(6000);

    await updateAccount(a.spaceId, target.id, { balanceMinor: 7000, loadedBalanceMinor: 6000 });
    expect(await balance(a.spaceId, target.id)).toBe(7000);
    expect(await balance(a.spaceId, source.id)).toBe(9000);

    const source2 = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const target2 = await anchoredAccount(a.spaceId, a.user.id, 5000);
    await transferAt(a.spaceId, a.user.id, source2.id, target2.id, 1000, 1000, AFTER_ANCHOR);

    await updateAccount(a.spaceId, source2.id, { balanceMinor: 3000, loadedBalanceMinor: 9000 });
    expect(await balance(a.spaceId, source2.id)).toBe(3000);
    expect(await balance(a.spaceId, target2.id)).toBe(6000);
  });

  it("18a. a transfer entered after the anchor counts by its moment of entry", async () => {
    const a = await mkSpaceUser();
    const source = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const target = await anchoredAccount(a.spaceId, a.user.id, 5000);
    await transferAt(
      a.spaceId,
      a.user.id,
      source.id,
      target.id,
      1000,
      1000,
      AFTER_ANCHOR,
      toISODate(BEFORE_ANCHOR),
    );

    expect(await balance(a.spaceId, source.id)).toBe(9000);
    expect(await balance(a.spaceId, target.id)).toBe(6000);
  });

  it("19. expenses, top-ups and transfers in and out together: each sum counted once", async () => {
    const a = await mkSpaceUser();
    const first = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const second = await anchoredAccount(a.spaceId, a.user.id, 5000, { currency: "USD" });
    const third = await anchoredAccount(a.spaceId, a.user.id, 3000, { currency: "EUR" });
    await expenseAt(a.spaceId, a.user.id, first.id, 1000, AFTER_ANCHOR);
    await expenseAt(a.spaceId, a.user.id, first.id, 2000, AFTER_ANCHOR);
    await topUpAt(a.spaceId, a.user.id, first.id, 300, AFTER_ANCHOR);
    await topUpAt(a.spaceId, a.user.id, first.id, 400, AFTER_ANCHOR);
    await transferAt(a.spaceId, a.user.id, first.id, second.id, 150, 2, AFTER_ANCHOR);
    await transferAt(a.spaceId, a.user.id, first.id, second.id, 50, 1, AFTER_ANCHOR);
    await transferAt(a.spaceId, a.user.id, third.id, first.id, 70, 800, AFTER_ANCHOR);
    await transferAt(a.spaceId, a.user.id, first.id, second.id, 9999, 99, BEFORE_ANCHOR);

    const expectedFirst = {
      balanceMinor: 10000 - 3000 + 700 - 200 + 800,
      expenseCount: 2,
    };
    const expectedSecond = { balanceMinor: 5003, expenseCount: 0 };
    const expectedThird = { balanceMinor: 2930, expenseCount: 0 };
    expect(await getAccount(a.spaceId, first.id)).toMatchObject(expectedFirst);
    expect(await getAccount(a.spaceId, second.id)).toMatchObject(expectedSecond);
    expect(await getAccount(a.spaceId, third.id)).toMatchObject(expectedThird);
    expect(await listAccounts(a.spaceId)).toMatchObject([
      { id: first.id, ...expectedFirst },
      { id: second.id, ...expectedSecond },
      { id: third.id, ...expectedThird },
    ]);
  });

  it("20. editing a transfer's amount shifts only its side's balance; same currency shifts both; deleting restores both", async () => {
    const a = await mkSpaceUser();
    const usd = await anchoredAccount(a.spaceId, a.user.id, 50000, { currency: "USD" });
    const eur = await anchoredAccount(a.spaceId, a.user.id, 20000, { currency: "EUR" });
    const usd2 = await anchoredAccount(a.spaceId, a.user.id, 10000, { currency: "USD" });
    const mixed = await transferAt(a.spaceId, a.user.id, usd.id, eur.id, 10000, 9200, AFTER_ANCHOR);
    const same = await transferAt(a.spaceId, a.user.id, usd.id, usd2.id, 1000, 1000, AFTER_ANCHOR);
    expect(await balance(a.spaceId, usd.id)).toBe(39000);
    expect(await balance(a.spaceId, eur.id)).toBe(29200);
    expect(await balance(a.spaceId, usd2.id)).toBe(11000);

    await updateTransferAmount(a.spaceId, mixed.id, usd.id, 12000);
    expect(await balance(a.spaceId, usd.id)).toBe(37000);
    expect(await balance(a.spaceId, eur.id)).toBe(29200);

    await updateTransferAmount(a.spaceId, mixed.id, eur.id, 9000);
    expect(await balance(a.spaceId, usd.id)).toBe(37000);
    expect(await balance(a.spaceId, eur.id)).toBe(29000);

    await updateTransferAmount(a.spaceId, same.id, usd2.id, 3000);
    expect(await balance(a.spaceId, usd.id)).toBe(35000);
    expect(await balance(a.spaceId, usd2.id)).toBe(13000);

    expect(await deleteTransfer(a.spaceId, mixed.id, usd.id)).toEqual({ ok: true });
    expect(await deleteTransfer(a.spaceId, same.id, usd2.id)).toEqual({ ok: true });
    expect(await balance(a.spaceId, usd.id)).toBe(50000);
    expect(await balance(a.spaceId, eur.id)).toBe(20000);
    expect(await balance(a.spaceId, usd2.id)).toBe(10000);
  });

  it("21. deleting one account of a transfer leaves the other account's balance unchanged", async () => {
    const a = await mkSpaceUser();
    const source = await anchoredAccount(a.spaceId, a.user.id, 10000);
    const target = await anchoredAccount(a.spaceId, a.user.id, 5000);
    const back = await anchoredAccount(a.spaceId, a.user.id, 8000);
    await transferAt(a.spaceId, a.user.id, source.id, target.id, 1000, 1000, AFTER_ANCHOR);
    await transferAt(a.spaceId, a.user.id, back.id, target.id, 500, 500, AFTER_ANCHOR);
    expect(await balance(a.spaceId, target.id)).toBe(6500);

    expect(await deleteAccount(a.spaceId, source.id)).toEqual({ ok: true });
    expect(await balance(a.spaceId, target.id)).toBe(6500);

    expect(await deleteAccount(a.spaceId, target.id)).toEqual({ ok: true });
    expect(await balance(a.spaceId, back.id)).toBe(7500);
  });
});
