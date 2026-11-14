import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { transfers } from "@/db/schema";
import { mkAccount, mkSpaceUser, mkTransfer, type SpaceUser } from "@/test/factories";
import { session } from "@/test/session-mock";

vi.mock("@/lib/dal", () => import("@/test/session-mock"));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import { deleteAccount } from "@/repositories/accounts";
import { deleteTransfer, listAccountTransfers } from "@/repositories/transfers";
import {
  createTransferAction,
  deleteTransferAction,
  updateTransferAction,
} from "@/lib/actions/transfers";

const INVALID = { ok: false, error: "Проверьте поля формы" };
const NOT_FOUND = { ok: false, error: "Перевод не найден" };
const ACCOUNT_NOT_FOUND = { ok: false, error: "Счёт не найден", notFound: true };
const TARGET_NOT_FOUND = { ok: false, error: "Счёт не найден" };
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
  session.now = null;
});

async function storedTransfers() {
  return db.select().from(transfers).where(eq(transfers.spaceId, me.spaceId));
}

async function pair() {
  const from = await mkAccount(me.spaceId, me.user.id, { currency: "USD" });
  const to = await mkAccount(me.spaceId, me.user.id, { currency: "EUR" });
  const transfer = await mkTransfer(me.spaceId, me.user.id, {
    fromAccountId: from.id,
    toAccountId: to.id,
    fromAmountMinor: 10_000,
    toAmountMinor: 9_200,
  });
  return { from, to, transfer };
}

describe("transfer actions", () => {
  it("create stores the day of the creator's clock, not the server's, revalidates /accounts and the account page, and fetches no rates", async () => {
    const from = await mkAccount(me.spaceId, me.user.id, { currency: "USD" });
    const to = await mkAccount(me.spaceId, me.user.id, { currency: "EUR" });
    session.now = new Date(2024, 10, 1, 23, 30);

    const result = await createTransferAction({
      fromAccountId: from.id,
      toAccountId: to.id,
      fromAmountMinor: 10_000,
      toAmountMinor: 9_200,
    });

    expect(result).toEqual({ ok: true, data: null });
    expect(await storedTransfers()).toEqual([
      expect.objectContaining({
        fromAccountId: from.id,
        toAccountId: to.id,
        fromAmountMinor: 10_000,
        toAmountMinor: 9_200,
        createdBy: me.user.id,
        enteredOn: "2024-11-01",
      }),
    ]);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    expect(outbound).not.toHaveBeenCalled();
  });

  it("update and delete revalidate the same pages and fetch no rates", async () => {
    const { from, transfer } = await pair();

    expect(await updateTransferAction(from.id, transfer.id, { amountMinor: 700 })).toEqual({
      ok: true,
      data: null,
    });
    expect((await listAccountTransfers(me.spaceId, from.id))[0].amountMinor).toBe(700);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    expect(outbound).not.toHaveBeenCalled();

    vi.clearAllMocks();
    expect(await deleteTransferAction(from.id, transfer.id)).toEqual({
      ok: true,
      data: null,
    });
    expect(await storedTransfers()).toEqual([]);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    expect(outbound).not.toHaveBeenCalled();
  });

  it("create, update and delete work the same with account and transfer ids in upper case", async () => {
    const from = await mkAccount(me.spaceId, me.user.id, { currency: "USD" });
    const to = await mkAccount(me.spaceId, me.user.id, { currency: "EUR" });
    const FROM = from.id.toUpperCase();
    const TO = to.id.toUpperCase();

    const created = await createTransferAction({
      fromAccountId: FROM,
      toAccountId: TO,
      fromAmountMinor: 10_000,
      toAmountMinor: 9_200,
    });
    expect(created.ok).toBe(true);
    const stored = await storedTransfers();
    expect(stored).toEqual([
      expect.objectContaining({
        fromAccountId: from.id,
        toAccountId: to.id,
        fromAmountMinor: 10_000,
        toAmountMinor: 9_200,
      }),
    ]);
    const ID = stored[0].id.toUpperCase();

    expect(await updateTransferAction(FROM, ID, { amountMinor: 700 })).toMatchObject({ ok: true });
    expect(await updateTransferAction(TO, ID, { amountMinor: 600 })).toMatchObject({ ok: true });
    expect(await storedTransfers()).toEqual([
      expect.objectContaining({ fromAmountMinor: 700, toAmountMinor: 600 }),
    ]);
    expect(await listAccountTransfers(me.spaceId, FROM)).toEqual([
      expect.objectContaining({ side: "out", amountMinor: 700, currency: "USD" }),
    ]);
    expect(await listAccountTransfers(me.spaceId, TO)).toEqual([
      expect.objectContaining({ side: "in", amountMinor: 600, currency: "EUR" }),
    ]);

    expect(await deleteTransferAction(TO, ID)).toMatchObject({ ok: true });
    expect(await storedTransfers()).toEqual([]);
  });

  it("the same account in two letter cases is refused as invalid input and writes nothing", async () => {
    const account = await mkAccount(me.spaceId, me.user.id, { currency: "USD" });

    expect(
      await createTransferAction({
        fromAccountId: account.id.toUpperCase(),
        toAccountId: account.id,
        fromAmountMinor: 100,
      }),
    ).toEqual(INVALID);
    expect(await storedTransfers()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it("create: invalid input, the same account twice, a missing credit across currencies → INVALID, nothing stored", async () => {
    const usd = await mkAccount(me.spaceId, me.user.id, { currency: "USD" });
    const eur = await mkAccount(me.spaceId, me.user.id, { currency: "EUR" });

    expect(await createTransferAction({ garbage: true })).toEqual(INVALID);
    expect(
      await createTransferAction({
        fromAccountId: "not-a-uuid",
        toAccountId: eur.id,
        fromAmountMinor: 100,
      }),
    ).toEqual(INVALID);
    expect(
      await createTransferAction({
        fromAccountId: usd.id,
        toAccountId: eur.id,
        fromAmountMinor: 0,
        toAmountMinor: 100,
      }),
    ).toEqual(INVALID);
    expect(
      await createTransferAction({
        fromAccountId: usd.id,
        toAccountId: eur.id,
        fromAmountMinor: 100,
        toAmountMinor: -1,
      }),
    ).toEqual(INVALID);
    expect(
      await createTransferAction({
        fromAccountId: usd.id,
        toAccountId: usd.id,
        fromAmountMinor: 100,
      }),
    ).toEqual(INVALID);
    expect(
      await createTransferAction({
        fromAccountId: usd.id,
        toAccountId: eur.id,
        fromAmountMinor: 100,
      }),
    ).toEqual(INVALID);

    expect(await storedTransfers()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it("create from another space's account returns notFound", async () => {
    const stranger = await mkSpaceUser();
    const foreign = await mkAccount(stranger.spaceId, stranger.user.id);
    const mine = await mkAccount(me.spaceId, me.user.id);

    expect(
      await createTransferAction({
        fromAccountId: foreign.id,
        toAccountId: mine.id,
        fromAmountMinor: 100,
      }),
    ).toEqual(ACCOUNT_NOT_FOUND);
    expect(await storedTransfers()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it("create to another space's account returns «Счёт не найден» without notFound and revalidates", async () => {
    const stranger = await mkSpaceUser();
    const foreign = await mkAccount(stranger.spaceId, stranger.user.id);
    const mine = await mkAccount(me.spaceId, me.user.id);

    expect(
      await createTransferAction({
        fromAccountId: mine.id,
        toAccountId: foreign.id,
        fromAmountMinor: 100,
      }),
    ).toEqual(TARGET_NOT_FOUND);
    expect(await storedTransfers()).toEqual([]);
    expect(
      await db.select().from(transfers).where(eq(transfers.spaceId, stranger.spaceId)),
    ).toEqual([]);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    expect(outbound).not.toHaveBeenCalled();
  });

  it("update and delete: a non-uuid account id → notFound; a non-uuid transfer id → «Перевод не найден»", async () => {
    const { from, transfer } = await pair();

    expect(await updateTransferAction("not-a-uuid", transfer.id, { amountMinor: 1 })).toEqual(
      ACCOUNT_NOT_FOUND,
    );
    expect(await deleteTransferAction("not-a-uuid", transfer.id)).toEqual(ACCOUNT_NOT_FOUND);
    expect(await updateTransferAction(from.id, "not-a-uuid", { amountMinor: 1 })).toEqual(
      NOT_FOUND,
    );
    expect(await deleteTransferAction(from.id, "not-a-uuid")).toEqual(NOT_FOUND);
    expect(await updateTransferAction(from.id, transfer.id, { amountMinor: 0 })).toEqual(
      INVALID,
    );
    expect(await updateTransferAction(from.id, transfer.id, {})).toEqual(INVALID);

    expect(await storedTransfers()).toEqual([transfer]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("a transfer gone from an existing account revalidates and keeps the user on the page", async () => {
    const { from, to, transfer } = await pair();
    const third = await mkAccount(me.spaceId, me.user.id, { currency: "USD" });

    expect(await updateTransferAction(third.id, transfer.id, { amountMinor: 1 })).toEqual(
      NOT_FOUND,
    );
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    vi.clearAllMocks();
    expect(await deleteTransferAction(third.id, transfer.id)).toEqual(NOT_FOUND);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    expect(await storedTransfers()).toEqual([transfer]);

    const stranger = await mkSpaceUser();
    const foreign = await mkTransfer(stranger.spaceId, stranger.user.id, {
      fromAccountId: (await mkAccount(stranger.spaceId, stranger.user.id)).id,
      toAccountId: (await mkAccount(stranger.spaceId, stranger.user.id)).id,
    });
    vi.clearAllMocks();
    expect(await updateTransferAction(from.id, foreign.id, { amountMinor: 1 })).toEqual(
      NOT_FOUND,
    );
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    vi.clearAllMocks();
    expect(await deleteTransferAction(from.id, foreign.id)).toEqual(NOT_FOUND);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    expect(
      await db.select().from(transfers).where(eq(transfers.id, foreign.id)),
    ).toEqual([foreign]);

    await deleteTransfer(me.spaceId, transfer.id, from.id);
    vi.clearAllMocks();
    expect(await updateTransferAction(to.id, transfer.id, { amountMinor: 1 })).toEqual(
      NOT_FOUND,
    );
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    vi.clearAllMocks();
    expect(await deleteTransferAction(to.id, transfer.id)).toEqual(NOT_FOUND);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual(ACCOUNT_PAGES);
    expect(outbound).not.toHaveBeenCalled();
  });

  it("a transfer whose page account is gone returns notFound, for update and for delete, while the other account and the transfer stay", async () => {
    const { from, to, transfer } = await pair();
    expect(await deleteAccount(me.spaceId, from.id)).toEqual({ ok: true });

    expect(await updateTransferAction(from.id, transfer.id, { amountMinor: 1 })).toEqual(
      ACCOUNT_NOT_FOUND,
    );
    expect(await deleteTransferAction(from.id, transfer.id)).toEqual(ACCOUNT_NOT_FOUND);

    expect(await listAccountTransfers(me.spaceId, to.id)).toEqual([
      expect.objectContaining({ id: transfer.id, side: "in", amountMinor: 9_200 }),
    ]);
    expect(await storedTransfers()).toEqual([
      { ...transfer, fromAccountId: null, fromAmountMinor: 10_000 },
    ]);

    const mirror = await pair();
    expect(await deleteAccount(me.spaceId, mirror.to.id)).toEqual({ ok: true });
    expect(
      await updateTransferAction(mirror.to.id, mirror.transfer.id, { amountMinor: 1 }),
    ).toEqual(ACCOUNT_NOT_FOUND);
    expect(await deleteTransferAction(mirror.to.id, mirror.transfer.id)).toEqual(
      ACCOUNT_NOT_FOUND,
    );
    expect(await listAccountTransfers(me.spaceId, mirror.from.id)).toEqual([
      expect.objectContaining({ id: mirror.transfer.id, side: "out", amountMinor: 10_000 }),
    ]);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it("update and delete with another space's account id return notFound and touch nothing", async () => {
    const stranger = await mkSpaceUser();
    const foreignFrom = await mkAccount(stranger.spaceId, stranger.user.id);
    const foreignTo = await mkAccount(stranger.spaceId, stranger.user.id);
    const foreign = await mkTransfer(stranger.spaceId, stranger.user.id, {
      fromAccountId: foreignFrom.id,
      toAccountId: foreignTo.id,
      fromAmountMinor: 1234,
    });

    expect(await updateTransferAction(foreignFrom.id, foreign.id, { amountMinor: 1 })).toEqual(
      ACCOUNT_NOT_FOUND,
    );
    expect(await deleteTransferAction(foreignFrom.id, foreign.id)).toEqual(ACCOUNT_NOT_FOUND);
    expect(
      await db.select().from(transfers).where(eq(transfers.id, foreign.id)),
    ).toEqual([foreign]);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });

  it("a signed-out caller is redirected before validation and nothing is written", async () => {
    const { from, to, transfer } = await pair();
    session.current = null;

    await expect(createTransferAction({ garbage: true })).rejects.toThrow(
      "NEXT_REDIRECT;/login",
    );
    await expect(
      createTransferAction({
        fromAccountId: from.id,
        toAccountId: to.id,
        fromAmountMinor: 1,
        toAmountMinor: 1,
      }),
    ).rejects.toThrow("NEXT_REDIRECT;/login");
    await expect(updateTransferAction(from.id, "not-a-uuid", {})).rejects.toThrow(
      "NEXT_REDIRECT;/login",
    );
    await expect(deleteTransferAction(from.id, "not-a-uuid")).rejects.toThrow(
      "NEXT_REDIRECT;/login",
    );
    await expect(deleteTransferAction(from.id, transfer.id)).rejects.toThrow(
      "NEXT_REDIRECT;/login",
    );
    expect(await storedTransfers()).toEqual([transfer]);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(outbound).not.toHaveBeenCalled();
  });
});
