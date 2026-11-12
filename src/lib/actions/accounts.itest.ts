import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SpaceId } from "@/lib/space-id";
import { mkAccount, mkSpaceUser, type SpaceUser } from "@/test/factories";

const session = vi.hoisted(() => ({
  current: null as { userId: string; spaceId: SpaceId } | null,
}));

vi.mock("@/lib/dal", () => ({
  requireSpace: async () => {
    if (session.current === null) throw new Error("NEXT_REDIRECT;/login");
    return {
      user: { id: session.current.userId },
      spaceId: session.current.spaceId,
      role: "owner",
    };
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { getAccount, listAccounts } from "@/repositories/accounts";
import {
  createAccountAction,
  deleteAccountAction,
  updateAccountAction,
} from "@/lib/actions/accounts";

const DUPLICATE = { ok: false, error: "Счёт с таким названием уже есть" };
const NOT_FOUND = { ok: false, error: "Счёт не найден" };
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

    expect(result.ok).toBe(true);
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

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ spaceId: me.spaceId, color: "#EC4899" });
    expect((await getAccount(me.spaceId, result.data.id))?.color).toBe("#EC4899");
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
  });
});
