import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import {
  createAccount,
  deleteAccount,
  getAccount,
  listAccountOptions,
  listAccounts,
  updateAccount,
} from "@/repositories/accounts";
import { mkAccount, mkExpense, mkMember, mkSpaceUser } from "@/test/factories";

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
    await mkExpense(a.spaceId, a.user.id, { accountId: account.id });
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
    expect(await deleteAccount(b.spaceId, account.id)).toEqual({
      ok: false,
      reason: "not_found",
    });

    expect(await row(account.id)).toEqual(before);
    expect((await listAccounts(a.spaceId)).map((x) => x.id)).toEqual([account.id]);
    expect(await listAccountOptions(b.spaceId)).toEqual([]);
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
  it("createAccount anchors the balance at the DB clock and keeps the color", async () => {
    const a = await mkSpaceUser();
    const created = await createAccount(a.spaceId, a.user.id, {
      name: "Карта USD",
      currency: "USD",
      color: "#8B5CF6",
      balanceMinor: 124050,
    });
    expect(created).toMatchObject({
      anchorAmountMinor: 124050,
      balanceMinor: 124050,
      currency: "USD",
      color: "#8B5CF6",
      createdBy: a.user.id,
    });
    expect(created.anchorAt).toEqual(created.createdAt);
    expect(await getAccount(a.spaceId, created.id)).toEqual(created);
  });

  it("lists accounts by created_at with balance = anchor and their colors", async () => {
    const a = await mkSpaceUser();
    const first = await mkAccount(a.spaceId, a.user.id, {
      name: "Б",
      color: "#10B981",
      anchorAmountMinor: 1,
    });
    const second = await mkAccount(a.spaceId, a.user.id, {
      name: "А",
      color: "#F97316",
      anchorAmountMinor: 2,
    });
    expect(
      (await listAccounts(a.spaceId)).map((x) => [x.id, x.balanceMinor, x.color]),
    ).toEqual([
      [first.id, 1, "#10B981"],
      [second.id, 2, "#F97316"],
    ]);
  });

  it("lists account options in the same order as listAccounts", async () => {
    const a = await mkSpaceUser();
    const first = await mkAccount(a.spaceId, a.user.id, { name: "Б", currency: "EUR" });
    const second = await mkAccount(a.spaceId, a.user.id, { name: "А", currency: "USD" });
    expect(await listAccountOptions(a.spaceId)).toEqual([
      { id: first.id, name: "Б", currency: "EUR" },
      { id: second.id, name: "А", currency: "USD" },
    ]);
  });

  it("a name-only patch leaves the anchor alone", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id, { anchorAmountMinor: 700 });
    const updated = await updateAccount(a.spaceId, account.id, { name: "Новое" });
    expect(updated).toMatchObject({ name: "Новое", anchorAmountMinor: 700, balanceMinor: 700 });
    expect(updated!.anchorAt).toEqual(account.anchorAt);
  });

  it("a color-only patch changes the color and leaves the balance and anchor alone", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id, {
      color: "#10B981",
      anchorAmountMinor: 700,
      anchorAt: new Date("2026-01-01T00:00:00Z"),
    });
    await mkExpense(a.spaceId, a.user.id, { accountId: account.id, amountMinor: 200 });
    const updated = await updateAccount(a.spaceId, account.id, { color: "#EC4899" });
    expect(updated).toMatchObject({
      name: account.name,
      color: "#EC4899",
      anchorAmountMinor: 700,
      balanceMinor: 500,
    });
    expect(updated!.anchorAt).toEqual(account.anchorAt);
    expect((await row(account.id)).color).toBe("#EC4899");
  });

  it("a color patch with an unchanged balance does not re-anchor", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id, {
      color: "#10B981",
      anchorAmountMinor: 700,
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const updated = await updateAccount(a.spaceId, account.id, {
      color: "#EC4899",
      balanceMinor: 700,
      loadedBalanceMinor: 700,
    });
    expect(updated).toMatchObject({ color: "#EC4899", anchorAmountMinor: 700 });
    expect(updated!.anchorAt).toEqual(account.anchorAt);
    expect(info).not.toHaveBeenCalledWith("account.reanchored", expect.anything());
  });

  it("a color patch with a new balance changes the color and re-anchors", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id, {
      color: "#10B981",
      anchorAmountMinor: 700,
      anchorAt: new Date("2026-01-01T00:00:00Z"),
    });
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const updated = await updateAccount(a.spaceId, account.id, {
      color: "#EC4899",
      balanceMinor: 300,
      loadedBalanceMinor: 700,
    });
    expect(updated).toMatchObject({ color: "#EC4899", anchorAmountMinor: 300, balanceMinor: 300 });
    expect(updated!.anchorAt.getTime()).toBeGreaterThan(account.anchorAt.getTime());
    expect(info).toHaveBeenCalledWith("account.reanchored", {
      accountId: account.id,
      spaceId: a.spaceId,
    });
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

describe("accounts repository — delete", () => {
  it("deleteAccount reports has_expenses for an account with expenses", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id);
    await mkExpense(a.spaceId, a.user.id, { accountId: account.id });

    expect(await deleteAccount(a.spaceId, account.id)).toEqual({
      ok: false,
      reason: "has_expenses",
    });
    expect(await getAccount(a.spaceId, account.id)).not.toBeNull();
  });

  it("a raw DELETE of an account with expenses fails with 23001", async () => {
    const a = await mkSpaceUser();
    const account = await mkAccount(a.spaceId, a.user.id);
    await mkExpense(a.spaceId, a.user.id, { accountId: account.id });

    await expect(
      db.delete(accounts).where(eq(accounts.id, account.id)),
    ).rejects.toMatchObject({ cause: { code: "23001" } });
    expect(await row(account.id)).toBeTruthy();
  });

  it("an expense inserted between the check and the delete → has_expenses", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const account = await mkAccount(owner.spaceId, owner.user.id);

    const realDelete = db.delete.bind(db);
    const spy = vi.spyOn(db, "delete").mockImplementationOnce(((
      table: Parameters<typeof db.delete>[0],
    ) => {
      const builder = realDelete(table);
      const realReturning = builder.returning.bind(builder);
      return Object.assign(builder, {
        returning: (fields: Parameters<typeof realReturning>[0]) =>
          mkExpense(owner.spaceId, member.user.id, { accountId: account.id }).then(() =>
            realReturning(fields!),
          ),
      });
    }) as unknown as typeof db.delete);

    try {
      expect(await deleteAccount(owner.spaceId, account.id)).toEqual({
        ok: false,
        reason: "has_expenses",
      });
    } finally {
      spy.mockRestore();
    }
    expect(await getAccount(owner.spaceId, account.id)).not.toBeNull();
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

  it("rejects a color that is not a hex code", async () => {
    const a = await mkSpaceUser();
    await expect(
      mkAccount(a.spaceId, a.user.id, { color: "blue" }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });
});
