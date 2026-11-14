import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkAccount, mkExpense, mkSpaceUser, type SpaceUser } from "@/test/factories";
import { session } from "@/test/session-mock";

vi.mock("@/lib/dal", () => import("@/test/session-mock"));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { deleteAccount } from "@/repositories/accounts";
import { deleteExpense, getExpense } from "@/repositories/expenses";
import {
  createExpenseAction,
  deleteExpenseAction,
  updateExpenseAction,
} from "@/lib/actions/expenses";

const UPDATE_FAILED = { ok: false, error: "Не удалось обновить трату" };
const NOT_FOUND = { ok: false, error: "Трата не найдена" };
const ACCOUNT_NOT_FOUND = { ok: false, error: "Счёт не найден", notFound: true };

// Saves touch the database only: no exchange rate is fetched on the way.
const outbound = vi.fn();
vi.stubGlobal("fetch", outbound);
afterAll(() => {
  vi.unstubAllGlobals();
});

let me: SpaceUser;

beforeEach(async () => {
  vi.clearAllMocks();
  me = await mkSpaceUser();
  session.current = { userId: me.user.id, spaceId: me.spaceId };
});

async function goneExpense() {
  const account = await mkAccount(me.spaceId, me.user.id);
  const expense = await mkExpense(me.spaceId, me.user.id, { accountId: account.id });
  await deleteExpense(me.spaceId, expense.id);
  return { account, expense };
}

describe("expense actions on an account page", () => {
  it("a gone expense of a living account revalidates and keeps the user on the page", async () => {
    const { account, expense } = await goneExpense();

    expect(await updateExpenseAction(expense.id, { amountMinor: 1 }, account.id)).toEqual(
      NOT_FOUND,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/accounts/[id]", "page");

    vi.clearAllMocks();
    expect(await deleteExpenseAction(expense.id, account.id)).toEqual(NOT_FOUND);
    expect(revalidatePath).toHaveBeenCalledWith("/accounts/[id]", "page");
  });

  it("a gone expense whose account is gone too returns notFound", async () => {
    const { account, expense } = await goneExpense();
    expect(await deleteAccount(me.spaceId, account.id)).toEqual({ ok: true });

    expect(await updateExpenseAction(expense.id, { amountMinor: 1 }, account.id)).toEqual(
      ACCOUNT_NOT_FOUND,
    );
    expect(await deleteExpenseAction(expense.id, account.id)).toEqual(ACCOUNT_NOT_FOUND);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("without an account page a gone expense never returns notFound", async () => {
    const { account, expense } = await goneExpense();
    expect(await deleteAccount(me.spaceId, account.id)).toEqual({ ok: true });

    expect(await updateExpenseAction(expense.id, { amountMinor: 1 })).toEqual(NOT_FOUND);
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/history");

    vi.clearAllMocks();
    expect(await deleteExpenseAction(expense.id)).toEqual(NOT_FOUND);
    expect(revalidatePath).toHaveBeenCalledWith("/history");
  });

  it("a rejected patch of an expense that still exists keeps the generic failure", async () => {
    const other = await mkSpaceUser();
    const foreign = await mkExpense(other.spaceId, other.user.id);
    const expense = await mkExpense(me.spaceId, me.user.id, { amountMinor: 700 });

    expect(await updateExpenseAction(expense.id, { categoryId: foreign.categoryId })).toEqual(
      UPDATE_FAILED,
    );
    expect(await getExpense(me.spaceId, expense.id)).toMatchObject({ amountMinor: 700 });
  });

  it("a page account that is not a uuid returns notFound and leaves the expense alone", async () => {
    const expense = await mkExpense(me.spaceId, me.user.id, { amountMinor: 700 });

    expect(await updateExpenseAction(expense.id, { amountMinor: 1 }, "not-a-uuid")).toEqual(
      ACCOUNT_NOT_FOUND,
    );
    expect(await deleteExpenseAction(expense.id, "not-a-uuid")).toEqual(ACCOUNT_NOT_FOUND);
    expect(await getExpense(me.spaceId, expense.id)).toMatchObject({ amountMinor: 700 });
  });
});

describe("an unchanged expense save", () => {
  it("accepts an empty patch, keeps the expense and succeeds", async () => {
    const expense = await mkExpense(me.spaceId, me.user.id, { amountMinor: 700 });

    expect(await updateExpenseAction(expense.id, {})).toEqual({ ok: true, data: null });
    expect(await getExpense(me.spaceId, expense.id)).toEqual(expense);
  });
});

describe("expense saves and rates", () => {
  it("create and update fetch no rates, whatever the date", async () => {
    const account = await mkAccount(me.spaceId, me.user.id);
    const { categoryId } = await mkExpense(me.spaceId, me.user.id, { accountId: account.id });

    const created = await createExpenseAction({
      categoryId,
      accountId: account.id,
      amountMinor: 500,
      currency: "RUB",
      note: "Обед",
      spentAt: "2024-11-01",
    });
    expect(created).toEqual({ ok: true, data: null });

    const expense = await mkExpense(me.spaceId, me.user.id, { accountId: account.id });
    expect(await updateExpenseAction(expense.id, { spentAt: "2024-11-04" })).toEqual({
      ok: true,
      data: null,
    });
    expect(outbound).not.toHaveBeenCalled();
  });
});
