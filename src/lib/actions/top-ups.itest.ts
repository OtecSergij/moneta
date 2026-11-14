import { addDays } from "date-fns";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { toISODate } from "@/lib/dates";
import { mkAccount, mkSpaceUser, mkTopUp, type SpaceUser } from "@/test/factories";
import { session } from "@/test/session-mock";

vi.mock("@/lib/dal", () => import("@/test/session-mock"));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { deleteAccount } from "@/repositories/accounts";
import { deleteTopUp, getTopUp, listTopUps } from "@/repositories/top-ups";
import {
  createTopUpAction,
  deleteTopUpAction,
  updateTopUpAction,
} from "@/lib/actions/top-ups";

const INVALID = { ok: false, error: "Проверьте поля формы" };
const NOT_FOUND = { ok: false, error: "Пополнение не найдено" };
const ACCOUNT_NOT_FOUND = { ok: false, error: "Счёт не найден", notFound: true };
const FUTURE_DATE = { ok: false, error: "Дата не может быть в будущем" };
const ACCOUNT_PAGES = [["/accounts"], ["/accounts/[id]", "page"]];

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

describe("top-up actions", () => {
  it("create in the session's space revalidates /accounts and the account page and fetches no rates", async () => {
    const account = await mkAccount(me.spaceId, me.user.id);

    const result = await createTopUpAction({
      accountId: account.id,
      amountMinor: 50_000,
      note: "  Зарплата ",
      occurredOn: "2024-11-01",
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(await listTopUps(me.spaceId, account.id)).toEqual([
      expect.objectContaining({
        spaceId: me.spaceId,
        accountId: account.id,
        createdBy: me.user.id,
        amountMinor: 50_000,
        note: "Зарплата",
        occurredOn: "2024-11-01",
      }),
    ]);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    expect(outbound).not.toHaveBeenCalled();
  });

  it("a blank description is saved as «Пополнение» on create and update", async () => {
    const account = await mkAccount(me.spaceId, me.user.id);

    const created = await createTopUpAction({
      accountId: account.id,
      amountMinor: 100,
      note: "   ",
      occurredOn: "2024-11-01",
    });
    expect(created).toEqual({ ok: true, data: null });
    expect(await listTopUps(me.spaceId, account.id)).toEqual([
      expect.objectContaining({ note: "Пополнение" }),
    ]);

    const named = await mkTopUp(me.spaceId, me.user.id, {
      accountId: account.id,
      note: "Зарплата",
    });
    expect(await updateTopUpAction(account.id, named.id, { note: "" })).toEqual({
      ok: true,
      data: null,
    });
    expect(await getTopUp(me.spaceId, named.id)).toMatchObject({ note: "Пополнение" });
  });

  it("update and delete revalidate the same pages and fetch no rates", async () => {
    const account = await mkAccount(me.spaceId, me.user.id);
    const topUp = await mkTopUp(me.spaceId, me.user.id, { accountId: account.id });

    const updated = await updateTopUpAction(account.id, topUp.id, {
      amountMinor: 700,
      note: "",
    });
    expect(updated).toEqual({ ok: true, data: null });
    expect(await getTopUp(me.spaceId, topUp.id)).toMatchObject({
      amountMinor: 700,
      note: "Пополнение",
    });
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    expect(outbound).not.toHaveBeenCalled();

    vi.clearAllMocks();
    const moved = await updateTopUpAction(account.id, topUp.id, { occurredOn: "2024-11-04" });
    expect(moved).toEqual({ ok: true, data: null });
    expect(await getTopUp(me.spaceId, topUp.id)).toMatchObject({ occurredOn: "2024-11-04" });
    expect(outbound).not.toHaveBeenCalled();

    vi.clearAllMocks();
    expect(await deleteTopUpAction(account.id, topUp.id)).toEqual({
      ok: true,
      data: null,
    });
    expect(await getTopUp(me.spaceId, topUp.id)).toBeNull();
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    expect(outbound).not.toHaveBeenCalled();
  });

  it("returns an error for a non-uuid id, invalid input, another space's top-up", async () => {
    const account = await mkAccount(me.spaceId, me.user.id);
    const mine = await mkTopUp(me.spaceId, me.user.id, { accountId: account.id });
    const stranger = await mkSpaceUser();
    const foreignAccount = await mkAccount(stranger.spaceId, stranger.user.id);
    const foreign = await mkTopUp(stranger.spaceId, stranger.user.id, {
      accountId: foreignAccount.id,
      amountMinor: 1234,
    });
    const tooFar = toISODate(addDays(new Date(), 2));

    expect(await updateTopUpAction(account.id, "not-a-uuid", { amountMinor: 1 })).toEqual(
      NOT_FOUND,
    );
    expect(await deleteTopUpAction(account.id, "not-a-uuid")).toEqual(NOT_FOUND);
    expect(await updateTopUpAction("not-a-uuid", mine.id, { amountMinor: 1 })).toEqual(
      ACCOUNT_NOT_FOUND,
    );
    expect(await deleteTopUpAction("not-a-uuid", mine.id)).toEqual(ACCOUNT_NOT_FOUND);

    expect(
      await createTopUpAction({
        accountId: account.id,
        amountMinor: 0,
        note: "",
        occurredOn: "2024-11-01",
      }),
    ).toEqual(INVALID);
    expect(
      await createTopUpAction({
        accountId: "not-a-uuid",
        amountMinor: 100,
        note: "",
        occurredOn: "2024-11-01",
      }),
    ).toEqual(INVALID);
    expect(await updateTopUpAction(account.id, mine.id, { amountMinor: -5 })).toEqual(INVALID);

    expect(
      await createTopUpAction({
        accountId: account.id,
        amountMinor: 100,
        note: "",
        occurredOn: tooFar,
      }),
    ).toEqual(FUTURE_DATE);
    expect(await updateTopUpAction(account.id, mine.id, { occurredOn: tooFar })).toEqual(
      FUTURE_DATE,
    );
    expect(await getTopUp(me.spaceId, mine.id)).toEqual(mine);
    expect(revalidatePath).not.toHaveBeenCalled();

    expect(await updateTopUpAction(account.id, foreign.id, { amountMinor: 1 })).toEqual(
      NOT_FOUND,
    );
    expect(await deleteTopUpAction(account.id, foreign.id)).toEqual(NOT_FOUND);
    expect(await getTopUp(stranger.spaceId, foreign.id)).toMatchObject({ amountMinor: 1234 });
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([...ACCOUNT_PAGES, ...ACCOUNT_PAGES]);
    expect(outbound).not.toHaveBeenCalled();
  });

  it("a top-up gone from an existing account revalidates and keeps the user on the page", async () => {
    const account = await mkAccount(me.spaceId, me.user.id);
    const topUp = await mkTopUp(me.spaceId, me.user.id, { accountId: account.id });
    await deleteTopUp(me.spaceId, topUp.id);

    expect(await updateTopUpAction(account.id, topUp.id, { amountMinor: 1 })).toEqual(NOT_FOUND);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);

    vi.clearAllMocks();
    expect(await deleteTopUpAction(account.id, topUp.id)).toEqual(NOT_FOUND);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    expect(outbound).not.toHaveBeenCalled();
  });

  it("a top-up whose account is gone returns notFound", async () => {
    const account = await mkAccount(me.spaceId, me.user.id);
    const topUp = await mkTopUp(me.spaceId, me.user.id, { accountId: account.id });
    expect(await deleteAccount(me.spaceId, account.id)).toEqual({ ok: true });

    expect(await updateTopUpAction(account.id, topUp.id, { amountMinor: 1 })).toEqual(
      ACCOUNT_NOT_FOUND,
    );
    expect(await deleteTopUpAction(account.id, topUp.id)).toEqual(ACCOUNT_NOT_FOUND);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it("create on another space's account returns notFound", async () => {
    const stranger = await mkSpaceUser();
    const foreignAccount = await mkAccount(stranger.spaceId, stranger.user.id);

    expect(
      await createTopUpAction({
        accountId: foreignAccount.id,
        amountMinor: 100,
        note: "",
        occurredOn: "2024-11-01",
      }),
    ).toEqual(ACCOUNT_NOT_FOUND);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("update and delete with another space's account id return notFound and touch nothing", async () => {
    const stranger = await mkSpaceUser();
    const foreignAccount = await mkAccount(stranger.spaceId, stranger.user.id);
    const foreign = await mkTopUp(stranger.spaceId, stranger.user.id, {
      accountId: foreignAccount.id,
      amountMinor: 1234,
    });

    expect(
      await updateTopUpAction(foreignAccount.id, foreign.id, { amountMinor: 1 }),
    ).toEqual(ACCOUNT_NOT_FOUND);
    expect(await deleteTopUpAction(foreignAccount.id, foreign.id)).toEqual(ACCOUNT_NOT_FOUND);
    expect(await getTopUp(stranger.spaceId, foreign.id)).toMatchObject({ amountMinor: 1234 });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it("an empty patch is rejected as invalid", async () => {
    const account = await mkAccount(me.spaceId, me.user.id);
    const topUp = await mkTopUp(me.spaceId, me.user.id, { accountId: account.id });

    expect(await updateTopUpAction(account.id, topUp.id, {})).toEqual(INVALID);
    expect(
      await updateTopUpAction(account.id, topUp.id, { accountId: account.id }),
    ).toEqual(INVALID);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a signed-out caller is redirected before validation and nothing is written", async () => {
    const account = await mkAccount(me.spaceId, me.user.id);
    const topUp = await mkTopUp(me.spaceId, me.user.id, { accountId: account.id });
    session.current = null;

    await expect(createTopUpAction({ garbage: true })).rejects.toThrow("NEXT_REDIRECT;/login");
    await expect(updateTopUpAction(account.id, "not-a-uuid", {})).rejects.toThrow(
      "NEXT_REDIRECT;/login",
    );
    await expect(deleteTopUpAction(account.id, "not-a-uuid")).rejects.toThrow(
      "NEXT_REDIRECT;/login",
    );
    await expect(deleteTopUpAction(account.id, topUp.id)).rejects.toThrow(
      "NEXT_REDIRECT;/login",
    );
    expect(await getTopUp(me.spaceId, topUp.id)).not.toBeNull();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });
});
