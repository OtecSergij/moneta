import { addDays, subDays } from "date-fns";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { topUps } from "@/db/schema";
import { toISODate, todayISO } from "@/lib/dates";
import { maxEntryDate } from "@/lib/fx/provider";
import { TopUpInput, TopUpPatch } from "@/lib/top-ups";
import { deleteAccount } from "@/repositories/accounts";
import { listExpenses, summary } from "@/repositories/expenses";
import {
  createTopUp,
  deleteTopUp,
  getTopUp,
  listTopUps,
  updateTopUp,
} from "@/repositories/top-ups";
import { mkAccount, mkExpense, mkMember, mkSpaceUser, mkTopUp } from "@/test/factories";
import { interceptNextInsert } from "@/test/intercept-insert";

const today = todayISO();
const yesterday = toISODate(subDays(new Date(), 1));
const tooFar = toISODate(addDays(new Date(), 2));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("top-ups", () => {
  it("lists an account's top-ups newest first with the account currency", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id, { currency: "USD" });
    const other = await mkAccount(a.spaceId, a.user.id, { currency: "USD" });
    const first = await mkTopUp(a.spaceId, a.user.id, { accountId: account.id });
    const second = await mkTopUp(a.spaceId, a.user.id, { accountId: account.id });
    const older = await mkTopUp(a.spaceId, a.user.id, {
      accountId: account.id,
      occurredOn: yesterday,
    });
    await mkTopUp(a.spaceId, a.user.id, { accountId: other.id });

    const listed = await listTopUps(a.spaceId, account.id);
    expect(listed.map((t) => t.id)).toEqual([second.id, first.id, older.id]);
    expect(listed.every((t) => t.currency === "USD")).toBe(true);
  });

  it("rejects a future date on create and update (future_date)", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id);

    expect(
      await createTopUp(a.spaceId, a.user.id, {
        accountId: account.id,
        amountMinor: 1000,
        note: "Зарплата",
        occurredOn: tooFar,
      }),
    ).toEqual({ ok: false, reason: "future_date" });

    const topUp = await mkTopUp(a.spaceId, a.user.id, { accountId: account.id });
    expect(await updateTopUp(a.spaceId, topUp.id, { occurredOn: tooFar })).toEqual({
      ok: false,
      reason: "future_date",
    });
    expect((await getTopUp(a.spaceId, topUp.id))?.occurredOn).toBe(today);
  });

  it("one day ahead of the server is allowed on create and update", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id);
    const tomorrow = maxEntryDate();

    const created = await createTopUp(a.spaceId, a.user.id, {
      accountId: account.id,
      amountMinor: 1000,
      note: "Зарплата",
      occurredOn: tomorrow,
    });
    expect(created).toMatchObject({ ok: true, topUp: { occurredOn: tomorrow } });

    const other = await mkTopUp(a.spaceId, a.user.id, { accountId: account.id });
    expect(await updateTopUp(a.spaceId, other.id, { occurredOn: tomorrow })).toMatchObject({
      ok: true,
      topUp: { occurredOn: tomorrow },
    });
  });

  it("an empty patch returns the row unchanged", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id);
    const topUp = await mkTopUp(a.spaceId, a.user.id, { accountId: account.id });

    expect(await updateTopUp(a.spaceId, topUp.id, {})).toEqual({ ok: true, topUp });
    expect(await updateTopUp(a.spaceId, topUp.id, { note: undefined })).toEqual({
      ok: true,
      topUp,
    });
  });

  it("an update writes only the amount, note and date, whatever else the patch carries", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id);
    const sibling = await mkAccount(a.spaceId, a.user.id);
    const foreign = await mkAccount(b.spaceId, b.user.id);
    const topUp = await mkTopUp(a.spaceId, a.user.id, { accountId: account.id });

    const sameSpace = { amountMinor: 4200, accountId: sibling.id };
    expect(await updateTopUp(a.spaceId, topUp.id, sameSpace as TopUpPatch)).toMatchObject({
      ok: true,
      topUp: { amountMinor: 4200, accountId: account.id, spaceId: a.spaceId },
    });

    const otherSpace = { accountId: foreign.id, spaceId: b.spaceId };
    expect(await updateTopUp(a.spaceId, topUp.id, otherSpace as TopUpPatch)).toMatchObject({
      ok: true,
      topUp: { accountId: account.id, spaceId: a.spaceId },
    });
    expect(await listTopUps(b.spaceId, foreign.id)).toEqual([]);
  });

  it("rejects another space's account on create (account_not_found)", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const foreign = await mkAccount(b.spaceId, b.user.id);

    expect(
      await createTopUp(a.spaceId, a.user.id, {
        accountId: foreign.id,
        amountMinor: 1000,
        note: "Зарплата",
        occurredOn: today,
      }),
    ).toEqual({ ok: false, reason: "account_not_found" });
    expect(await listTopUps(b.spaceId, foreign.id)).toEqual([]);
  });

  it("another space's account is refused before the insert; nothing is written", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const foreign = await mkAccount(b.spaceId, b.user.id);
    const insert = vi.spyOn(db, "insert");

    expect(
      await createTopUp(a.spaceId, a.user.id, {
        accountId: foreign.id,
        amountMinor: 1000,
        note: "Зарплата",
        occurredOn: today,
      }),
    ).toEqual({ ok: false, reason: "account_not_found" });
    expect(insert).not.toHaveBeenCalled();
    expect(await db.select().from(topUps).where(eq(topUps.accountId, foreign.id))).toEqual([]);
  });

  it("an account deleted between the check and the insert → account_not_found", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id);

    interceptNextInsert(() => deleteAccount(a.spaceId, account.id));

    expect(
      await createTopUp(a.spaceId, a.user.id, {
        accountId: account.id,
        amountMinor: 1000,
        note: "Зарплата",
        occurredOn: today,
      }),
    ).toEqual({ ok: false, reason: "account_not_found" });
  });

  it("database rejects a top-up linked to another space's account", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const foreign = await mkAccount(b.spaceId, b.user.id);

    await expect(
      db.insert(topUps).values({
        spaceId: a.spaceId,
        accountId: foreign.id,
        createdBy: a.user.id,
        amountMinor: 1000,
        note: "Зарплата",
        occurredOn: today,
      }),
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("amount must be positive, note length 1..200", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id);
    const row = {
      spaceId: a.spaceId,
      accountId: account.id,
      createdBy: a.user.id,
      amountMinor: 1000,
      note: "а",
      occurredOn: today,
    };

    for (const bad of [{ amountMinor: 0 }, { note: "" }, { note: "а".repeat(201) }]) {
      await expect(db.insert(topUps).values({ ...row, ...bad })).rejects.toMatchObject({
        cause: { code: "23514" },
      });
    }
    await db.insert(topUps).values(row);
    await db.insert(topUps).values({ ...row, note: "а".repeat(200) });
    expect(await listTopUps(a.spaceId, account.id)).toHaveLength(2);
  });

  it("a blank note is stored as «Пополнение» on create and update", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id);

    const created = await createTopUp(
      a.spaceId,
      a.user.id,
      TopUpInput.parse({ accountId: account.id, amountMinor: 1000, note: "  ", occurredOn: today }),
    );
    expect(created).toMatchObject({ ok: true, topUp: { note: "Пополнение" } });

    const named = await mkTopUp(a.spaceId, a.user.id, { accountId: account.id, note: "Зарплата" });
    expect(await updateTopUp(a.spaceId, named.id, TopUpPatch.parse({ note: "" }))).toMatchObject({
      ok: true,
      topUp: { note: "Пополнение" },
    });
    expect((await listTopUps(a.spaceId, account.id)).map((t) => t.note)).toEqual([
      "Пополнение",
      "Пополнение",
    ]);
  });

  it("a member edits and deletes the owner's top-up", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const account = await mkAccount(owner.spaceId, owner.user.id);
    const topUp = await mkTopUp(owner.spaceId, owner.user.id, { accountId: account.id });

    const updated = await updateTopUp(member.spaceId, topUp.id, {
      amountMinor: 5000,
      note: "Премия",
      occurredOn: yesterday,
    });
    expect(updated).toMatchObject({
      ok: true,
      topUp: {
        amountMinor: 5000,
        note: "Премия",
        occurredOn: yesterday,
        accountId: account.id,
        createdBy: owner.user.id,
      },
    });

    expect(await deleteTopUp(member.spaceId, topUp.id)).toEqual({ ok: true });
    expect(await getTopUp(owner.spaceId, topUp.id)).toBeNull();
  });

  it("history summary and listExpenses ignore top-ups", async () => {
    const a = await mkSpaceUser();
    const expense = await mkExpense(a.spaceId, a.user.id, { amountMinor: 1500 });
    const range = { from: today, to: today };
    const before = await summary(a.spaceId, "RUB", range);

    await mkTopUp(a.spaceId, a.user.id, { accountId: expense.accountId, amountMinor: 9000 });

    expect(await summary(a.spaceId, "RUB", range)).toEqual(before);
    expect((await listExpenses(a.spaceId, "RUB")).map((e) => e.id)).toEqual([expense.id]);
    expect(
      (await listExpenses(a.spaceId, "RUB", { accountId: expense.accountId })).map((e) => e.id),
    ).toEqual([expense.id]);
  });
});
