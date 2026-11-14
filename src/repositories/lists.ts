import { and, asc, eq, inArray, or, sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { listItems, lists } from "@/db/schema";
import type { ListInput, ListVisibility } from "@/lib/lists";
import type { SpaceId } from "@/lib/space-id";

export type ListSummary = {
  id: string;
  name: string;
  visibility: ListVisibility;
  doneCount: number;
  totalCount: number;
};

export type ListItem = { id: string; text: string; checked: boolean };

export type ListWithItems = Pick<ListSummary, "id" | "name" | "visibility"> & {
  isMine: boolean;
  items: ListItem[];
};

export type ListOpResult = { ok: true } | { ok: false; reason: "not_found" };

type AddItemResult =
  | { ok: true; item: ListItem }
  | { ok: false; reason: "not_found" };

type SetListVisibilityResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "forbidden" };

// Every write repeats this predicate inside its own statement: a separate
// check-then-write would let the author make the list private in between.
function visibleList(spaceId: SpaceId, userId: string): SQL {
  return and(
    eq(lists.spaceId, spaceId),
    or(eq(lists.visibility, "shared"), eq(lists.createdBy, userId)),
  )!;
}

const NOT_FOUND = { ok: false, reason: "not_found" } as const;

export async function listLists(
  spaceId: SpaceId,
  userId: string,
): Promise<ListSummary[]> {
  return await db
    .select({
      id: lists.id,
      name: lists.name,
      visibility: lists.visibility,
      doneCount: sql<number>`count(${listItems.id}) filter (where ${listItems.checked})::int`,
      totalCount: sql<number>`count(${listItems.id})::int`,
    })
    .from(lists)
    .leftJoin(listItems, eq(listItems.listId, lists.id))
    .where(visibleList(spaceId, userId))
    .groupBy(lists.id)
    .orderBy(asc(lists.position), asc(lists.id));
}

export async function getList(
  spaceId: SpaceId,
  userId: string,
  listId: string,
): Promise<ListWithItems | null> {
  const [summary] = await db
    .select({
      id: lists.id,
      name: lists.name,
      visibility: lists.visibility,
      isMine: sql<boolean>`${lists.createdBy} = ${userId}`,
    })
    .from(lists)
    .where(and(eq(lists.id, listId), visibleList(spaceId, userId)));
  if (!summary) return null;
  const items = await db
    .select({ id: listItems.id, text: listItems.text, checked: listItems.checked })
    .from(listItems)
    .innerJoin(lists, eq(lists.id, listItems.listId))
    .where(and(eq(listItems.listId, listId), visibleList(spaceId, userId)))
    .orderBy(asc(listItems.checked), asc(listItems.createdAt), asc(listItems.id));
  return { ...summary, items };
}

export async function isListVisible(
  spaceId: SpaceId,
  userId: string,
  listId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: lists.id })
    .from(lists)
    .where(and(eq(lists.id, listId), visibleList(spaceId, userId)));
  return rows.length > 0;
}

export async function createList(
  spaceId: SpaceId,
  userId: string,
  input: ListInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(lists)
    .values({
      spaceId,
      createdBy: userId,
      name: input.name,
      visibility: input.visibility,
      position: sql`(select least(coalesce(min(${lists.position}), 0), 0) - 1 from ${lists} where ${lists.spaceId} = ${spaceId})`,
    })
    .returning({ id: lists.id });
  return row;
}

// Puts a list right after `afterId` (null: first) in the space-wide order and
// renumbers the space to 0..n-1; createList stays below 0, so a new list never
// ties with a renumbered one. Other members' private lists keep their places.
export async function moveList(
  spaceId: SpaceId,
  userId: string,
  listId: string,
  afterId: string | null,
): Promise<ListOpResult> {
  return await db.transaction(async (tx) => {
    // Lock in id order, which never changes, so concurrent moves can't
    // deadlock; read the order in a later statement, because ORDER BY with a
    // lock can return rows sorted by positions from before another move.
    const locked = await tx
      .select({ id: lists.id })
      .from(lists)
      .where(eq(lists.spaceId, spaceId))
      .orderBy(asc(lists.id))
      .for("no key update");
    if (locked.length === 0) return NOT_FOUND;
    const rows = await tx
      .select({
        id: lists.id,
        position: lists.position,
        visible: sql<boolean>`${or(eq(lists.visibility, "shared"), eq(lists.createdBy, userId))}`,
      })
      .from(lists)
      .where(inArray(lists.id, locked.map((r) => r.id)))
      .orderBy(asc(lists.position), asc(lists.id));

    const visible = new Set(rows.filter((r) => r.visible).map((r) => r.id));
    if (!visible.has(listId) || (afterId !== null && !visible.has(afterId))) {
      return NOT_FOUND;
    }
    if (afterId === listId) return { ok: true } as const;
    const order = rows.map((r) => r.id).filter((id) => id !== listId);
    order.splice(afterId === null ? 0 : order.indexOf(afterId) + 1, 0, listId);

    const changed = order.flatMap((id, position) =>
      rows.find((r) => r.id === id)?.position === position
        ? []
        : [sql`(${id}::uuid, ${position}::int)`],
    );
    if (changed.length > 0) {
      await tx.execute(sql`
        update "lists" set "position" = v.position
        from (values ${sql.join(changed, sql`, `)}) as v(id, position)
        where "lists"."id" = v.id`);
    }
    return { ok: true } as const;
  });
}

// Bumps updated_at of a visible list and row-locks it for the rest of the
// transaction, so the visibility seen by the following write can't change.
async function touchList(tx: Tx, visible: SQL, target: SQL): Promise<boolean> {
  const rows = await tx
    .update(lists)
    .set({ updatedAt: sql`now()` })
    .where(and(target, visible))
    .returning({ id: lists.id });
  return rows.length > 0;
}

const listOfItem = (itemId: string) =>
  sql`${lists.id} = (select "list_id" from "list_items" where "id" = ${itemId})`;

export async function renameList(
  spaceId: SpaceId,
  userId: string,
  listId: string,
  name: string,
): Promise<ListOpResult> {
  const rows = await db
    .update(lists)
    .set({ name, updatedAt: sql`now()` })
    .where(and(eq(lists.id, listId), visibleList(spaceId, userId)))
    .returning({ id: lists.id });
  return rows.length > 0 ? { ok: true } : NOT_FOUND;
}

export async function setListVisibility(
  spaceId: SpaceId,
  userId: string,
  listId: string,
  visibility: ListVisibility,
): Promise<SetListVisibilityResult> {
  return await db.transaction(async (tx) => {
    const rows = await tx
      .update(lists)
      .set({ visibility, updatedAt: sql`now()` })
      .where(
        and(
          eq(lists.id, listId),
          visibleList(spaceId, userId),
          eq(lists.createdBy, userId),
        ),
      )
      .returning({ id: lists.id });
    if (rows.length > 0) return { ok: true } as const;
    const [visible] = await tx
      .select({ id: lists.id })
      .from(lists)
      .where(and(eq(lists.id, listId), visibleList(spaceId, userId)));
    return visible ? { ok: false, reason: "forbidden" } : NOT_FOUND;
  });
}

export async function resetList(
  spaceId: SpaceId,
  userId: string,
  listId: string,
): Promise<ListOpResult> {
  const visible = visibleList(spaceId, userId);
  return await db.transaction(async (tx) => {
    if (!(await touchList(tx, visible, eq(lists.id, listId)))) return NOT_FOUND;
    await tx.execute(sql`
      update "list_items" set "checked" = false, "updated_at" = now()
      from "lists"
      where "list_items"."list_id" = "lists"."id" and ${eq(lists.id, listId)}
        and ${visible} and "list_items"."checked"`);
    return { ok: true } as const;
  });
}

export async function deleteList(
  spaceId: SpaceId,
  userId: string,
  listId: string,
): Promise<ListOpResult> {
  const rows = await db
    .delete(lists)
    .where(and(eq(lists.id, listId), visibleList(spaceId, userId)))
    .returning({ id: lists.id });
  return rows.length > 0 ? { ok: true } : NOT_FOUND;
}

export async function addItem(
  spaceId: SpaceId,
  userId: string,
  listId: string,
  text: string,
): Promise<AddItemResult> {
  const visible = visibleList(spaceId, userId);
  return await db.transaction(async (tx) => {
    if (!(await touchList(tx, visible, eq(lists.id, listId)))) return NOT_FOUND;
    const rows = await tx.execute<ListItem>(sql`
      insert into "list_items" ("list_id", "space_id", "created_by", "text")
      select "lists"."id", "lists"."space_id", ${userId}, ${text}
      from "lists" where ${eq(lists.id, listId)} and ${visible}
      returning "id", "text", "checked"`);
    const item = rows[0];
    return item ? ({ ok: true, item } as const) : NOT_FOUND;
  });
}

async function writeItem(
  spaceId: SpaceId,
  userId: string,
  listId: string,
  itemId: string,
  write: (visible: SQL) => SQL,
): Promise<ListOpResult> {
  const visible = and(visibleList(spaceId, userId), eq(lists.id, listId))!;
  return await db.transaction(async (tx) => {
    if (!(await touchList(tx, visible, listOfItem(itemId)))) return NOT_FOUND;
    const rows = await tx.execute(write(visible));
    return rows.length > 0 ? ({ ok: true } as const) : NOT_FOUND;
  });
}

export async function setItemText(
  spaceId: SpaceId,
  userId: string,
  listId: string,
  itemId: string,
  text: string,
): Promise<ListOpResult> {
  return await writeItem(spaceId, userId, listId, itemId, (visible) => sql`
    update "list_items" set "text" = ${text}, "updated_at" = now()
    from "lists"
    where "list_items"."id" = ${itemId} and "list_items"."list_id" = "lists"."id"
      and ${visible}
    returning "list_items"."id"`);
}

export async function setItemChecked(
  spaceId: SpaceId,
  userId: string,
  listId: string,
  itemId: string,
  checked: boolean,
): Promise<ListOpResult> {
  return await writeItem(spaceId, userId, listId, itemId, (visible) => sql`
    update "list_items" set "checked" = ${checked}, "updated_at" = now()
    from "lists"
    where "list_items"."id" = ${itemId} and "list_items"."list_id" = "lists"."id"
      and ${visible}
    returning "list_items"."id"`);
}

export async function deleteItem(
  spaceId: SpaceId,
  userId: string,
  listId: string,
  itemId: string,
): Promise<ListOpResult> {
  return await writeItem(spaceId, userId, listId, itemId, (visible) => sql`
    delete from "list_items" using "lists"
    where "list_items"."id" = ${itemId} and "list_items"."list_id" = "lists"."id"
      and ${visible}
    returning "list_items"."id"`);
}
