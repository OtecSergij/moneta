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
  moveList,
  renameList,
  resetList,
  setItemChecked,
  setItemText,
  setListVisibility,
} from "@/repositories/lists";
import {
  mkItem,
  mkList,
  mkMember,
  mkSpaceUser,
  type SpaceUser,
} from "@/test/factories";

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
    expect(await setItemText(s, u, list.id, item.id, "Чужой")).toEqual(nf);
    expect(await setItemChecked(s, u, list.id, item.id, true)).toEqual(nf);
    expect(await deleteItem(s, u, list.id, item.id)).toEqual(nf);
    expect(await moveList(s, u, list.id, null)).toEqual(nf);
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
    expect(await setItemChecked(a.spaceId, a.user.id, id, added.item.id, true)).toEqual({ ok: true });
    expect(await renameList(b.spaceId, b.user.id, id, "Продукты на неделю")).toEqual({ ok: true });

    for (const who of [a, b]) {
      expect(await getList(who.spaceId, who.user.id, id)).toEqual({
        id,
        name: "Продукты на неделю",
        visibility: "shared",
        isMine: who === a,
        items: [{ id: added.item.id, text: "Молоко", checked: true }],
      });
      expect(await listLists(who.spaceId, who.user.id)).toEqual([
        {
          id,
          name: "Продукты на неделю",
          visibility: "shared",
          doneCount: 1,
          totalCount: 1,
        },
      ]);
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
    expect(await setItemChecked(other.spaceId, other.user.id, list.id, item.id, true)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await deleteList(other.spaceId, other.user.id, list.id)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await moveList(other.spaceId, other.user.id, list.id, null)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(await snapshot(list.id)).toEqual(before);
  });

  it("an item write through a list that does not own the item is not_found", async () => {
    const a = await mkSpaceUser();
    const list = await mkList(a.spaceId, a.user.id);
    const item = await mkItem(list, a.user.id);
    const other = await mkList(a.spaceId, a.user.id);
    const before = await snapshot(list.id);
    const otherBefore = await snapshot(other.id);

    const nf = { ok: false, reason: "not_found" };
    expect(await setItemText(a.spaceId, a.user.id, other.id, item.id, "Чужой")).toEqual(nf);
    expect(await setItemChecked(a.spaceId, a.user.id, other.id, item.id, true)).toEqual(nf);
    expect(await deleteItem(a.spaceId, a.user.id, other.id, item.id)).toEqual(nf);

    expect(await snapshot(list.id)).toEqual(before);
    expect(await snapshot(other.id)).toEqual(otherBefore);
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
    expect(await setItemChecked(b.spaceId, b.user.id, list.id, item.id, true)).toEqual({ ok: true });

    await setListVisibility(a.spaceId, a.user.id, list.id, "private");

    expect(await setItemChecked(b.spaceId, b.user.id, list.id, item.id, false)).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect((await snapshot(list.id)).items[0].checked).toBe(true);
  });
});

describe("lists repository — ordering and updates", () => {
  const ops: Array<[string, (s: Awaited<ReturnType<typeof setup>>) => Promise<unknown>]> = [
    ["addItem", ({ a, target }) => addItem(a.spaceId, a.user.id, target.id, "Новый")],
    ["setItemText", ({ a, target, item }) => setItemText(a.spaceId, a.user.id, target.id, item.id, "Другой")],
    ["setItemChecked", ({ a, target, item }) => setItemChecked(a.spaceId, a.user.id, target.id, item.id, true)],
    ["deleteItem", ({ a, target, item }) => deleteItem(a.spaceId, a.user.id, target.id, item.id)],
    ["resetList", ({ a, target }) => resetList(a.spaceId, a.user.id, target.id)],
    ["renameList", ({ a, target }) => renameList(a.spaceId, a.user.id, target.id, "Наверх")],
    [
      "setListVisibility",
      ({ a, target }) => setListVisibility(a.spaceId, a.user.id, target.id, "private"),
    ],
  ];

  async function setup() {
    const a = await mkSpaceUser();
    const target = await mkList(a.spaceId, a.user.id, { name: "Цель", position: 1 });
    const item = await mkItem(target, a.user.id);
    const newer = await mkList(a.spaceId, a.user.id, { name: "Новее", position: 0 });
    return { a, target, item, newer };
  }

  it.each(ops)("%s leaves the list in its place", async (_, op) => {
    const s = await setup();
    expect((await listLists(s.a.spaceId, s.a.user.id)).map((l) => l.id)).toEqual([
      s.newer.id,
      s.target.id,
    ]);

    await op(s);

    expect((await listLists(s.a.spaceId, s.a.user.id)).map((l) => l.id)).toEqual([
      s.newer.id,
      s.target.id,
    ]);
  });

  it("checked items go last; a new item lands at the end of the unchecked ones", async () => {
    const a = await mkSpaceUser();
    const list = await mkList(a.spaceId, a.user.id);
    const first = await mkItem(list, a.user.id, { text: "Первый" });
    const second = await mkItem(list, a.user.id, { text: "Второй" });
    const third = await mkItem(list, a.user.id, { text: "Третий" });

    await setItemChecked(a.spaceId, a.user.id, list.id, first.id, true);
    await addItem(a.spaceId, a.user.id, list.id, "Четвёртый");

    const got = await getList(a.spaceId, a.user.id, list.id);
    expect(got?.items.map((i) => [i.text, i.checked])).toEqual([
      [second.text, false],
      [third.text, false],
      ["Четвёртый", false],
      [first.text, true],
    ]);
    expect(await listLists(a.spaceId, a.user.id)).toEqual([
      expect.objectContaining({ doneCount: 1, totalCount: 4 }),
    ]);
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
    expect(await listLists(a.spaceId, a.user.id)).toEqual([
      expect.objectContaining({ doneCount: 0, totalCount: 3 }),
    ]);
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

describe("lists repository — manual order", () => {
  async function create(
    who: SpaceUser,
    name: string,
    visibility: "shared" | "private" = "shared",
  ) {
    const { id } = await createList(who.spaceId, who.user.id, { name, visibility });
    return id;
  }

  const order = async (who: SpaceUser) =>
    (await listLists(who.spaceId, who.user.id)).map((l) => l.name);

  it("createList puts a new list on top", async () => {
    const a = await mkSpaceUser();
    await create(a, "Первый");
    await create(a, "Второй");
    await create(a, "Третий");

    expect(await order(a)).toEqual(["Третий", "Второй", "Первый"]);
  });

  it("moveList puts a list after another, first, or last, for every member", async () => {
    const { a, b } = await pair();
    const first = await create(a, "A");
    const second = await create(a, "B");
    await create(a, "C");
    const fourth = await create(a, "D");
    expect(await order(a)).toEqual(["D", "C", "B", "A"]);

    expect(await moveList(a.spaceId, a.user.id, first, fourth)).toEqual({ ok: true });
    expect(await order(a)).toEqual(["D", "A", "C", "B"]);

    expect(await moveList(b.spaceId, b.user.id, second, null)).toEqual({ ok: true });
    expect(await order(b)).toEqual(["B", "D", "A", "C"]);
    expect(await order(a)).toEqual(["B", "D", "A", "C"]);

    expect(await moveList(a.spaceId, a.user.id, second, first)).toEqual({ ok: true });
    expect(await order(a)).toEqual(["D", "A", "B", "C"]);

    const third = (await listLists(a.spaceId, a.user.id))[3].id;
    expect(await moveList(a.spaceId, a.user.id, fourth, third)).toEqual({ ok: true });
    expect(await order(a)).toEqual(["A", "B", "C", "D"]);

    expect(await moveList(a.spaceId, a.user.id, first, first)).toEqual({ ok: true });
    expect(await order(a)).toEqual(["A", "B", "C", "D"]);
  });

  it("lists that share a position move in the order listLists shows", async () => {
    const a = await mkSpaceUser();
    for (const name of ["P", "Q", "R"]) await mkList(a.spaceId, a.user.id, { name });
    const shown = await listLists(a.spaceId, a.user.id);

    await moveList(a.spaceId, a.user.id, shown[2].id, shown[0].id);

    expect(await order(a)).toEqual([shown[0].name, shown[2].name, shown[1].name]);
  });

  it("a new list after a move still lands on top", async () => {
    const a = await mkSpaceUser();
    const first = await create(a, "A");
    const second = await create(a, "B");
    await moveList(a.spaceId, a.user.id, second, first);
    await create(a, "C");

    expect(await order(a)).toEqual(["C", "A", "B"]);
  });

  it("another member's private list keeps its place among the rest", async () => {
    const { a, b } = await pair();
    await create(a, "Y");
    await create(a, "Тайный", "private");
    const x = await create(a, "X");
    const z = await create(b, "Z");
    expect(await order(a)).toEqual(["Z", "X", "Тайный", "Y"]);
    expect(await order(b)).toEqual(["Z", "X", "Y"]);

    expect(await moveList(b.spaceId, b.user.id, z, x)).toEqual({ ok: true });

    expect(await order(b)).toEqual(["X", "Z", "Y"]);
    expect(await order(a)).toEqual(["X", "Z", "Тайный", "Y"]);
  });

  it("a hidden list at either end stays there when others move around it", async () => {
    const { a, b } = await pair();
    await create(a, "Тайный внизу", "private");
    const x = await create(a, "X");
    const y = await create(a, "Y");
    await create(a, "Тайный вверху", "private");
    expect(await order(a)).toEqual(["Тайный вверху", "Y", "X", "Тайный внизу"]);

    await moveList(b.spaceId, b.user.id, x, null);
    expect(await order(a)).toEqual(["X", "Тайный вверху", "Y", "Тайный внизу"]);

    await moveList(b.spaceId, b.user.id, x, y);
    expect(await order(a)).toEqual(["Тайный вверху", "Y", "X", "Тайный внизу"]);
    expect(await order(b)).toEqual(["Y", "X"]);
  });

  it("moving or anchoring on a list the user cannot see is not_found and changes nothing", async () => {
    const { a, b } = await pair();
    const shared = await create(a, "Общий");
    const secret = await create(a, "Тайный", "private");
    const other = await mkSpaceUser();
    const foreign = await create(other, "Чужой");
    const before = await order(a);
    const nf = { ok: false, reason: "not_found" };

    expect(await moveList(b.spaceId, b.user.id, secret, null)).toEqual(nf);
    expect(await moveList(b.spaceId, b.user.id, shared, secret)).toEqual(nf);
    expect(await moveList(a.spaceId, a.user.id, shared, foreign)).toEqual(nf);
    expect(await moveList(a.spaceId, a.user.id, foreign, null)).toEqual(nf);

    expect(await order(a)).toEqual(before);
    expect(await order(other)).toEqual(["Чужой"]);
  });

  it("concurrent moves leave every list once, with distinct positions", async () => {
    const { a, b } = await pair();
    const ids: string[] = [];
    for (const name of ["A", "B", "C", "D", "E"]) ids.push(await create(a, name));

    const results = await Promise.all([
      moveList(a.spaceId, a.user.id, ids[0], null),
      moveList(b.spaceId, b.user.id, ids[4], ids[0]),
      moveList(a.spaceId, a.user.id, ids[2], ids[3]),
      moveList(b.spaceId, b.user.id, ids[1], null),
    ]);

    expect(results).toEqual(Array(4).fill({ ok: true }));
    expect([...(await order(a))].sort()).toEqual(["A", "B", "C", "D", "E"]);
    const positions = await db
      .select({ position: lists.position })
      .from(lists)
      .where(eq(lists.spaceId, a.spaceId));
    expect(new Set(positions.map((p) => p.position)).size).toBe(5);
  });

  it("a list created during a move gets a position of its own", async () => {
    const a = await mkSpaceUser();
    const ids: string[] = [];
    for (const name of ["A", "B", "C"]) ids.push(await create(a, name));

    await Promise.all([
      moveList(a.spaceId, a.user.id, ids[0], null),
      create(a, "D"),
      moveList(a.spaceId, a.user.id, ids[2], ids[1]),
    ]);

    expect([...(await order(a))].sort()).toEqual(["A", "B", "C", "D"]);
    const positions = await db
      .select({ position: lists.position })
      .from(lists)
      .where(eq(lists.spaceId, a.spaceId));
    expect(new Set(positions.map((p) => p.position)).size).toBe(4);
  });
});
