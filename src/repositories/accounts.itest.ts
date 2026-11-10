import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from "@/repositories/accounts";
import { mkAccount, mkMember, mkSpaceUser } from "@/test/factories";

afterEach(() => {
  vi.restoreAllMocks();
});

async function row(id: string) {
  const [r] = await db.select().from(accounts).where(eq(accounts.id, id));
  return r;
}

describe("accounts repository — isolation", () => {
  it("B's space cannot list, get, update or delete A's account", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id, { anchorAmountMinor: 500 });
    const before = await row(account.id);

    expect(await listAccounts(b.spaceId)).toEqual([]);
    expect(await getAccount(b.spaceId, account.id)).toBeNull();
    expect(
      await updateAccount(b.spaceId, account.id, {
        name: "Взлом",
        balanceMinor: 0,
        loadedBalanceMinor: 500,
      }),
    ).toBeNull();
    expect(await deleteAccount(b.spaceId, account.id)).toEqual({ ok: false });

    expect(await row(account.id)).toEqual(before);
    expect((await listAccounts(a.spaceId)).map((x) => x.id)).toEqual([account.id]);
  });

  it("a member edits and deletes the owner's accounts", async () => {
    const a = await mkSpaceUser();
    const b = await mkMember(a.spaceId);
    const account = await mkAccount(a.spaceId, a.user.id);

    const updated = await updateAccount(b.spaceId, account.id, { name: "Общая" });
    expect(updated?.name).toBe("Общая");
    expect(await deleteAccount(b.spaceId, account.id)).toEqual({ ok: true });
    expect(await getAccount(a.spaceId, account.id)).toBeNull();
  });
});

describe("accounts repository — anchor", () => {
  it("createAccount anchors the balance at the DB clock", async () => {
    const a = await mkSpaceUser();
    const created = await createAccount(a.spaceId, a.user.id, {
      name: "Карта USD",
      currency: "USD",
      balanceMinor: 124050,
    });
    expect(created).toMatchObject({
      anchorAmountMinor: 124050,
      balanceMinor: 124050,
      currency: "USD",
      createdBy: a.user.id,
    });
    expect(created.anchorAt).toEqual(created.createdAt);
    expect(await getAccount(a.spaceId, created.id)).toEqual(created);
  });

  it("lists accounts by created_at with balance = anchor", async () => {
    const a = await mkSpaceUser();
    const first = await mkAccount(a.spaceId, a.user.id, { name: "Б", anchorAmountMinor: 1 });
    const second = await mkAccount(a.spaceId, a.user.id, { name: "А", anchorAmountMinor: 2 });
    expect(
      (await listAccounts(a.spaceId)).map((x) => [x.id, x.balanceMinor]),
    ).toEqual([
      [first.id, 1],
      [second.id, 2],
    ]);
  });

  it("a name-only patch leaves the anchor alone", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id, { anchorAmountMinor: 700 });
    const updated = await updateAccount(a.spaceId, account.id, { name: "Новое" });
    expect(updated).toMatchObject({ name: "Новое", anchorAmountMinor: 700, balanceMinor: 700 });
    expect(updated!.anchorAt).toEqual(account.anchorAt);
  });

  it("balanceMinor equal to the loaded balance changes nothing", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id, { anchorAmountMinor: 700 });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const updated = await updateAccount(a.spaceId, account.id, {
      balanceMinor: 700,
      loadedBalanceMinor: 700,
    });
    expect(updated).toMatchObject({ anchorAmountMinor: 700 });
    expect(updated!.anchorAt).toEqual(account.anchorAt);
    expect(info).not.toHaveBeenCalledWith("account.reanchored", expect.anything());
  });

  it("balanceMinor different from the loaded balance re-anchors", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id, {
      anchorAmountMinor: 700,
      anchorAt: new Date("2026-01-01T00:00:00Z"),
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const updated = await updateAccount(a.spaceId, account.id, {
      balanceMinor: 300,
      loadedBalanceMinor: 700,
    });
    expect(updated).toMatchObject({ anchorAmountMinor: 300, balanceMinor: 300 });
    expect(updated!.anchorAt.getTime()).toBeGreaterThan(account.anchorAt.getTime());
    expect(info).toHaveBeenCalledWith("account.reanchored", {
      accountId: account.id,
      spaceId: a.spaceId,
    });
  });
});

describe("accounts repository — constraints", () => {
  it("names are unique within a space, not across spaces", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();
    await mkAccount(a.spaceId, a.user.id, { name: "Наличные" });
    await expect(
      mkAccount(a.spaceId, a.user.id, { name: "Наличные" }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
    await expect(mkAccount(b.spaceId, b.user.id, { name: "Наличные" })).resolves.toBeTruthy();

    const other = await mkAccount(a.spaceId, a.user.id, { name: "Карта" });
    await expect(
      updateAccount(a.spaceId, other.id, { name: "Наличные" }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("rejects a negative anchor", async () => {
    const a = await mkSpaceUser();
    await expect(
      mkAccount(a.spaceId, a.user.id, { anchorAmountMinor: -1 }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
