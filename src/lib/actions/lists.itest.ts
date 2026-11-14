import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { listItems, lists } from "@/db/schema";
import {
  mkItem,
  mkList,
  mkMember,
  mkSpaceUser,
  type SpaceUser,
} from "@/test/factories";
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

import {
  addItemAction,
  createListAction,
  deleteItemAction,
  deleteListAction,
  moveListAction,
  renameListAction,
  resetListAction,
  setItemCheckedAction,
  setItemTextAction,
  setListVisibilityAction,
} from "@/lib/actions/lists";

let me: SpaceUser;

beforeEach(async () => {
  vi.clearAllMocks();
  me = await mkSpaceUser();
  session.current = { userId: me.user.id, spaceId: me.spaceId };
});

describe("lists actions", () => {
  it("ignores a spaceId sent by the client and creates the list in the session's space", async () => {
    const other = await mkSpaceUser();

    const result = await createListAction({
      name: "Продукты",
      visibility: "shared",
      spaceId: other.spaceId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = await db.select().from(lists).where(eq(lists.id, result.data.id));
    expect(row.spaceId).toBe(me.spaceId);
  });

  it("rejects non-uuid ids with ok:false", async () => {
    const bad = "not-a-uuid";
    const results = await Promise.all([
      renameListAction(bad, "Имя"),
      setListVisibilityAction(bad, "private"),
      resetListAction(bad),
      deleteListAction(bad),
      addItemAction(bad, "Пункт"),
      setItemTextAction(bad, bad, "Пункт"),
      setItemCheckedAction(bad, bad, true),
      deleteItemAction(bad, bad),
      moveListAction(bad, null),
    ]);
    for (const r of results) expect(r.ok).toBe(false);
  });

  it("rejects invalid input with ok:false and writes nothing", async () => {
    const list = await mkList(me.spaceId, me.user.id, { name: "Исходное" });
    const item = await mkItem(list, me.user.id, { text: "Исходный" });

    const results = await Promise.all([
      createListAction({ name: "   ", visibility: "shared" }),
      createListAction({ name: "x".repeat(61), visibility: "shared" }),
      createListAction({ name: "Имя", visibility: "public" }),
      renameListAction(list.id, ""),
      setListVisibilityAction(list.id, "everyone"),
      addItemAction(list.id, "x".repeat(201)),
      setItemTextAction(list.id, item.id, "  "),
      setItemCheckedAction(list.id, item.id, "yes"),
    ]);
    for (const r of results) expect(r.ok).toBe(false);

    const [row] = await db.select().from(lists).where(eq(lists.id, list.id));
    expect(row).toMatchObject({ name: "Исходное", visibility: "shared" });
    expect(await db.select().from(lists).where(eq(lists.spaceId, me.spaceId))).toHaveLength(1);
    const items = await db.select().from(listItems).where(eq(listItems.listId, list.id));
    expect(items).toEqual([expect.objectContaining({ text: "Исходный", checked: false })]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("maps another member's private list to notFound without revalidating", async () => {
    const anna = await mkMember(me.spaceId);
    const list = await mkList(me.spaceId, anna.user.id, { visibility: "private" });
    const item = await mkItem(list, anna.user.id, { text: "Секрет" });

    const results = await Promise.all([
      renameListAction(list.id, "Чужое"),
      setListVisibilityAction(list.id, "shared"),
      resetListAction(list.id),
      deleteListAction(list.id),
      addItemAction(list.id, "Пункт"),
      setItemTextAction(list.id, item.id, "Чужое"),
      setItemCheckedAction(list.id, item.id, true),
      deleteItemAction(list.id, item.id),
      moveListAction(list.id, null),
    ]);
    for (const r of results) {
      expect(r).toMatchObject({ ok: false, notFound: true });
    }
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    const [row] = await db.select().from(lists).where(eq(lists.id, list.id));
    expect(row).toMatchObject({ name: list.name, visibility: "private" });
    const items = await db.select().from(listItems).where(eq(listItems.listId, list.id));
    expect(items).toEqual([expect.objectContaining({ text: "Секрет", checked: false })]);
  });

  it("keeps the user in a visible list when only the item is gone", async () => {
    const list = await mkList(me.spaceId, me.user.id, { visibility: "shared" });
    const item = await mkItem(list, me.user.id, { text: "Молоко" });
    await db.delete(listItems).where(eq(listItems.id, item.id));

    const results = await Promise.all([
      setItemTextAction(list.id, item.id, "Кефир"),
      setItemCheckedAction(list.id, item.id, true),
      deleteItemAction(list.id, item.id),
    ]);

    for (const r of results) {
      expect(r).toEqual({ ok: false, error: "Пункт не найден" });
    }
    expect(revalidatePath).toHaveBeenCalledWith("/lists");
  });

  it("moves a list and revalidates; a bad or self anchor is invalid", async () => {
    const first = await mkList(me.spaceId, me.user.id, { name: "A", position: 0 });
    const second = await mkList(me.spaceId, me.user.id, { name: "B", position: 1 });

    expect(await moveListAction(first.id, "not-a-uuid")).toMatchObject({ ok: false });
    expect(await moveListAction(first.id, first.id)).toMatchObject({ ok: false });
    expect(revalidatePath).not.toHaveBeenCalled();

    expect(await moveListAction(first.id, second.id)).toEqual({ ok: true, data: null });
    expect(revalidatePath).toHaveBeenCalledWith("/lists");
    const rows = await db
      .select({ name: lists.name })
      .from(lists)
      .where(eq(lists.spaceId, me.spaceId))
      .orderBy(lists.position);
    expect(rows.map((r) => r.name)).toEqual(["B", "A"]);
  });

  it("lets only the author change visibility", async () => {
    const anna = await mkMember(me.spaceId);
    const list = await mkList(me.spaceId, anna.user.id, { visibility: "shared" });

    const result = await setListVisibilityAction(list.id, "private");

    expect(result).toEqual({
      ok: false,
      error: "Видимость может менять только автор списка",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("deletes a list and redirects to /lists on the server", async () => {
    const list = await mkList(me.spaceId, me.user.id);

    await expect(deleteListAction(list.id)).rejects.toThrow("NEXT_REDIRECT;/lists");

    expect(redirect).toHaveBeenCalledWith("/lists", "replace");
    expect(revalidatePath).toHaveBeenCalledWith("/lists");
    expect(await db.select().from(lists).where(eq(lists.id, list.id))).toHaveLength(0);
  });
});
