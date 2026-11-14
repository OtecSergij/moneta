import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkAccount, mkExpense, mkSpaceUser, type SpaceUser } from "@/test/factories";
import { session } from "@/test/session-mock";

vi.mock("@/lib/dal", () => import("@/test/session-mock"));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  RedirectType: { push: "push", replace: "replace" },
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT;${url}`);
  }),
}));

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAccount, listAccounts } from "@/repositories/accounts";
import {
  createAccountAction,
  deleteAccountAction,
  updateAccountAction,
} from "@/lib/actions/accounts";

const DUPLICATE = { ok: false, error: "Счёт с таким названием уже есть" };
const NOT_FOUND = { ok: false, error: "Счёт не найден", notFound: true };
const INVALID = { ok: false, error: "Проверьте поля формы" };

let me: SpaceUser;

beforeEach(async () => {
  vi.clearAllMocks();
  me = await mkSpaceUser();
  session.current = { userId: me.user.id, spaceId: me.spaceId };
});

describe("accounts actions", () => {
  it("maps a duplicate name to a form error on create and update", async () => {
    await mkAccount(me.spaceId, me.user.id, { name: "Наличные" });
    const other = await mkAccount(me.spaceId, me.user.id, { name: "Карта" });

    expect(
      await createAccountAction({
        name: "Наличные",
        currency: "RUB",
        color: "#3B82F6",
        balanceMinor: 0,
      }),
    ).toEqual(DUPLICATE);
    expect(await updateAccountAction(other.id, { name: "Наличные" })).toEqual(DUPLICATE);
  });

  it("returns NOT_FOUND for a non-uuid id and for another space's account", async () => {
    const stranger = await mkSpaceUser();
    const foreign = await mkAccount(stranger.spaceId, stranger.user.id);

    expect(await updateAccountAction("not-a-uuid", { name: "Имя" })).toEqual(NOT_FOUND);
    expect(await deleteAccountAction("not-a-uuid")).toEqual(NOT_FOUND);
    expect(await updateAccountAction(foreign.id, { name: "Взлом" })).toEqual(NOT_FOUND);
    expect(await deleteAccountAction(foreign.id)).toEqual(NOT_FOUND);
    expect(await getAccount(stranger.spaceId, foreign.id)).not.toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects invalid input", async () => {
    const account = await mkAccount(me.spaceId, me.user.id);

    expect(
      await createAccountAction({
        name: "Карта",
        currency: "GBP",
        color: "#3B82F6",
        balanceMinor: 0,
      }),
    ).toEqual(INVALID);
    expect(
      await createAccountAction({
        name: "Карта",
        currency: "RUB",
        color: "#123456",
        balanceMinor: 0,
      }),
    ).toEqual(INVALID);
    expect(
      await createAccountAction({ name: "Карта", currency: "RUB", balanceMinor: 0 }),
    ).toEqual(INVALID);
    expect(await listAccounts(me.spaceId)).toHaveLength(1);
    expect(await updateAccountAction(account.id, {})).toEqual(INVALID);
    expect(await updateAccountAction(account.id, { balanceMinor: 100 })).toEqual(INVALID);
  });

  it("rejects a color outside the palette and leaves the account unchanged", async () => {
    const account = await mkAccount(me.spaceId, me.user.id, { color: "#10B981" });
    const before = await getAccount(me.spaceId, account.id);

    expect(await updateAccountAction(account.id, { color: "#123456" })).toEqual(INVALID);
    expect(await getAccount(me.spaceId, account.id)).toEqual(before);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("changes only the color and revalidates /accounts", async () => {
    const account = await mkAccount(me.spaceId, me.user.id, {
      color: "#10B981",
      anchorAmountMinor: 700,
    });

    const result = await updateAccountAction(account.id, { color: "#EC4899" });

    expect(result).toEqual({ ok: true, data: null });
    const stored = await getAccount(me.spaceId, account.id);
    expect(stored).toMatchObject({
      name: account.name,
      color: "#EC4899",
      anchorAmountMinor: 700,
      balanceMinor: 700,
    });
    expect(stored!.anchorAt).toEqual(account.anchorAt);
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
  });

  it("creates in the session's space with the chosen color and revalidates /accounts", async () => {
    const result = await createAccountAction({
      name: "Карта USD",
      currency: "USD",
      color: "#EC4899",
      balanceMinor: 124050,
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(await listAccounts(me.spaceId)).toEqual([
      expect.objectContaining({ name: "Карта USD", color: "#EC4899", balanceMinor: 124050 }),
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
  });

  it("deleteAccountAction refuses an account with expenses with a readable error and leaves it", async () => {
    const account = await mkAccount(me.spaceId, me.user.id);
    await mkExpense(me.spaceId, me.user.id, { accountId: account.id });

    expect(await deleteAccountAction(account.id)).toEqual({
      ok: false,
      error: "Сначала удалите или перенесите траты этого счёта",
    });
    expect(await getAccount(me.spaceId, account.id)).not.toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
    expect(redirect).not.toHaveBeenCalled();
  });

  it("deleteAccountAction deletes an empty account, revalidates /accounts and the account page, and redirects to /accounts", async () => {
    const account = await mkAccount(me.spaceId, me.user.id);

    await expect(deleteAccountAction(account.id)).rejects.toThrow("NEXT_REDIRECT;/accounts");
    expect(redirect).toHaveBeenCalledWith("/accounts", "replace");
    expect(await getAccount(me.spaceId, account.id)).toBeNull();
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
    expect(revalidatePath).toHaveBeenCalledWith("/accounts/[id]", "page");
  });
});
