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
import { getAccount } from "@/repositories/accounts";
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
      await createAccountAction({ name: "Наличные", currency: "RUB", balanceMinor: 0 }),
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
      await createAccountAction({ name: "Карта", currency: "GBP", balanceMinor: 0 }),
    ).toEqual(INVALID);
    expect(await updateAccountAction(account.id, {})).toEqual(INVALID);
    expect(await updateAccountAction(account.id, { balanceMinor: 100 })).toEqual(INVALID);
  });

  it("creates in the session's space and revalidates /accounts", async () => {
    const result = await createAccountAction({
      name: "Карта USD",
      currency: "USD",
      balanceMinor: 124050,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.spaceId).toBe(me.spaceId);
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
  });
});
