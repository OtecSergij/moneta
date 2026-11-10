import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { listItems, lists } from "@/db/schema";
import {
  addItem,
  createList,
  deleteItem,
  deleteList,
  getList,
  listLists,
  renameList,
  resetList,
  setItemChecked,
  setItemText,
  setListVisibility,
} from "@/repositories/lists";
import { mkItem, mkList, mkMember, mkSpaceUser } from "@/test/factories";

async function pair() {
  const a = await mkSpaceUser();
  const b = await mkMember(a.spaceId);
  return { a, b };
}

async function snapshot(listId: string) {
  const [list] = await db.select().from(lists).where(eq(lists.id, listId));
  const items = await db
    .select()
    .from(listItems)
    .where(eq(listItems.listId, listId))
    .orderBy(listItems.id);
  return { list, items };
}

describe("lists repository — visibility", () => {
  it("a private list of A is invisible to B, and every B operation on it is not_found with no change", async () => {
    const { a, b } = await pair();
    const list = await mkList(a.spaceId, a.user.id, { visibility: "private" });
    const item = await mkItem(list, a.user.id);
    const before = await snapshot(list.id);

    expect(await listLists(b.spaceId, b.user.id)).toEqual([]);
    expect(await getList(b.spaceId, b.user.id, list.id)).toBeNull();

    const nf = { ok: false, reason: "not_found" };
    const s = b.spaceId;
    const u = b.user.id;
    expect(await renameList(s, u, list.id, "Взлом")).toEqual(nf);
    expect(await setListVisibility(s, u, list.id, "shared")).toEqual(nf);
    expect(await resetList(s, u, list.id)).toEqual(nf);
    expect(await addItem(s, u, list.id, "Чужой")).toEqual(nf);
    expect(await setItemText(s, u, item.id, "Чужой")).toEqual(nf);
    expect(await setItemChecked(s, u, item.id, true)).toEqual(nf);
    expect(await deleteItem(s, u, item.id)).toEqual(nf);
    expect(await deleteList(s, u, list.id)).toEqual(nf);

    expect(await snapshot(list.id)).toEqual(before);
    expect((await listLists(a.spaceId, a.user.id)).map((l) => l.id)).toEqual([list.id]);
  });

  it("a shared list is seen and edited by both members", async () => {
    const { a, b } = await pair();
    const { id } = await createList(a.spaceId, a.user.id, {
      name: "Продукты",
      visibility: "shared",
    });

    const added = await addItem(b.spaceId, b.user.id, id, "Молоко");
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(await setItemChecked(a.spaceId, a.user.id, added.item.id, true)).toEqual({ ok: true });
    expect(await renameList(b.spaceId, b.user.id, id, "Продукты на неделю")).toEqual({ ok: true });

    for (const who of [a, b]) {
      const list = await getList(who.spaceId, who.user.id, id);
      expect(list).toMatchObject({
        name: "Продукты на неделю",
        isMine: who === a,
        doneCount: 1,
        totalCount: 1,
        items: [{ id: added.item.id, text: "Молоко", checked: true }],
      });
    }
  });

  it("another space sees nothing and can change nothing", async () => {
    const a = await mkSpaceUser();
    const other = await mkSpaceUser();
    const list = await mkList(a.spaceId, a.user.id);
    const item = await mkItem(list, a.user.id);
    const before = await snapshot(list.id);

    expect(await listLists(other.spaceId, other.user.id)).toEqual([]);
    expect(await getList(other.spaceId, other.user.id, list.id)).toBeNull();
    expect(await setItemChecked(other.spaceId, other.user.id, item.id, true)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteList(other.spaceId, other.user.id, list.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await snapshot(list.id)).toEqual(before);
  });

  it("setListVisibility by a non-author is forbidden; the author may change it", async () => {
    const { a, b } = await pair();
    const list = await mkList(a.spaceId, a.user.id);

    expect(await setListVisibility(b.spaceId, b.user.id, list.id, "private")).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect((await snapshot(list.id)).list.visibility).toBe("shared");

    expect(await setListVisibility(a.spaceId, a.user.id, list.id, "private")).toEqual({ ok: true });
    expect((await snapshot(list.id)).list.visibility).toBe("private");
  });

  it("once the author makes a list private, B's setItemChecked is not_found", async () => {
    const { a, b } = await pair();
    const list = await mkList(a.spaceId, a.user.id);
    const item = await mkItem(list, a.user.id);
    expect(await setItemChecked(b.spaceId, b.user.id, item.id, true)).toEqual({ ok: true });

    await setListVisibility(a.spaceId, a.user.id, list.id, "private");

    expect(await setItemChecked(b.spaceId, b.user.id, item.id, false)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect((await snapshot(list.id)).items[0].checked).toBe(true);
  });
});

describe("lists repository — ordering and updates", () => {
  const ops: Array<[string, (s: Awaited<ReturnType<typeof setup>>) => Promise<unknown>]> = [
    ["addItem", ({ a, target }) => addItem(a.spaceId, a.user.id, target.id, "Новый")],
    ["setItemText", ({ a, item }) => setItemText(a.spaceId, a.user.id, item.id, "Другой")],
    ["setItemChecked", ({ a, item }) => setItemChecked(a.spaceId, a.user.id, item.id, true)],
    ["deleteItem", ({ a, item }) => deleteItem(a.spaceId, a.user.id, item.id)],
    ["resetList", ({ a, target }) => resetList(a.spaceId, a.user.id, target.id)],
    ["renameList", ({ a, target }) => renameList(a.spaceId, a.user.id, target.id, "Наверх")],
    [
      "setListVisibility",
      ({ a, target }) => setListVisibility(a.spaceId, a.user.id, target.id, "private"),
    ],
  ];

  async function setup() {
    const a = await mkSpaceUser();
    const target = await mkList(a.spaceId, a.user.id, { name: "Цель" });
    const item = await mkItem(target, a.user.id);
    const newer = await mkList(a.spaceId, a.user.id, { name: "Новее" });
    return { a, target, item, newer };
  }

  it.each(ops)("%s lifts the list to the top of listLists", async (_, op) => {
    const s = await setup();
    expect((await listLists(s.a.spaceId, s.a.user.id)).map((l) => l.id)).toEqual([
      s.newer.id,
      s.target.id,
    ]);

    await op(s);

    expect((await listLists(s.a.spaceId, s.a.user.id)).map((l) => l.id)).toEqual([
      s.target.id,
      s.newer.id,
    ]);
  });

  it("checked items go last; a new item lands at the end of the unchecked ones", async () => {
    const a = await mkSpaceUser();
    const list = await mkList(a.spaceId, a.user.id);
    const first = await mkItem(list, a.user.id, { text: "Первый" });
    const second = await mkItem(list, a.user.id, { text: "Второй" });
    const third = await mkItem(list, a.user.id, { text: "Третий" });

    await setItemChecked(a.spaceId, a.user.id, first.id, true);
    await addItem(a.spaceId, a.user.id, list.id, "Четвёртый");

    const got = await getList(a.spaceId, a.user.id, list.id);
    expect(got?.items.map((i) => [i.text, i.checked])).toEqual([
      [second.text, false],
      [third.text, false],
      ["Четвёртый", false],
      [first.text, true],
    ]);
    expect(got).toMatchObject({ doneCount: 1, totalCount: 4 });
  });

  it("resetList unchecks every item", async () => {
    const a = await mkSpaceUser();
    const list = await mkList(a.spaceId, a.user.id);
    await mkItem(list, a.user.id, { checked: true });
    await mkItem(list, a.user.id, { checked: true });
    await mkItem(list, a.user.id);

    expect(await resetList(a.spaceId, a.user.id, list.id)).toEqual({ ok: true });

    const got = await getList(a.spaceId, a.user.id, list.id);
    expect(got?.items.every((i) => !i.checked)).toBe(true);
    expect(got).toMatchObject({ doneCount: 0, totalCount: 3 });
  });

  it("deleteList cascades to its items", async () => {
    const a = await mkSpaceUser();
    const list = await mkList(a.spaceId, a.user.id);
    await mkItem(list, a.user.id);
    await mkItem(list, a.user.id);

    expect(await deleteList(a.spaceId, a.user.id, list.id)).toEqual({ ok: true });

    expect(await db.select().from(listItems).where(eq(listItems.listId, list.id))).toEqual([]);
  });

  it("the composite FK rejects an item whose space_id differs from its list's (23503)", async () => {
    const a = await mkSpaceUser();
    const other = await mkSpaceUser();
    const list = await mkList(a.spaceId, a.user.id);

    const err = await mkItem({ id: list.id, spaceId: other.spaceId }, a.user.id).catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ cause: { code: "23503" } });
  });
});
