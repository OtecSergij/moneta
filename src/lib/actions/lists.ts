"use server";

import { RedirectType, redirect } from "next/navigation";
import { z } from "zod";
import { requireSpace } from "@/lib/dal";
import type { SpaceId } from "@/lib/space-id";
import { ItemText, ListInput, ListName, type ListActionResult } from "@/lib/lists";
import {
  addItem,
  createList,
  deleteItem,
  deleteList,
  isListVisible,
  moveList,
  renameList,
  resetList,
  setItemChecked,
  setItemText,
  setListVisibility,
  type ListOpResult,
} from "@/repositories/lists";
import { revalidateFor } from "./revalidate";
import { INVALID, isUuid } from "./types";

const Visibility = ListInput.shape.visibility;

const LIST_NOT_FOUND = { ok: false, error: "Список не найден", notFound: true } as const;
const ITEM_NOT_FOUND = { ok: false, error: "Пункт не найден" } as const;

function done(result: ListOpResult): ListActionResult<null> {
  if (!result.ok) return LIST_NOT_FOUND;
  revalidateFor("list");
  return { ok: true, data: null };
}

// A missing item in a list that is still visible is not a reason to leave the
// list: revalidate so the stale item drops out, and keep the user on the page.
async function itemDone(
  result: ListOpResult,
  spaceId: SpaceId,
  userId: string,
  listId: string,
): Promise<ListActionResult<null>> {
  if (result.ok) return done(result);
  if (!(await isListVisible(spaceId, userId, listId))) return LIST_NOT_FOUND;
  revalidateFor("list");
  return ITEM_NOT_FOUND;
}

export async function createListAction(
  input: unknown,
): Promise<ListActionResult<{ id: string }>> {
  const { user, spaceId } = await requireSpace();
  const parsed = ListInput.safeParse(input);
  if (!parsed.success) return INVALID;
  const list = await createList(spaceId, user.id, parsed.data);
  revalidateFor("list");
  return { ok: true, data: list };
}

export async function renameListAction(
  listId: string,
  name: unknown,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!isUuid(listId)) return LIST_NOT_FOUND;
  const parsed = ListName.safeParse(name);
  if (!parsed.success) return INVALID;
  return done(await renameList(spaceId, user.id, listId, parsed.data));
}

export async function setListVisibilityAction(
  listId: string,
  visibility: unknown,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!isUuid(listId)) return LIST_NOT_FOUND;
  const parsed = Visibility.safeParse(visibility);
  if (!parsed.success) return INVALID;
  const result = await setListVisibility(spaceId, user.id, listId, parsed.data);
  if (!result.ok) {
    return result.reason === "forbidden"
      ? { ok: false, error: "Видимость может менять только автор списка" }
      : LIST_NOT_FOUND;
  }
  revalidateFor("list");
  return { ok: true, data: null };
}

export async function moveListAction(
  listId: string,
  afterId: string | null,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!isUuid(listId)) return LIST_NOT_FOUND;
  if (afterId !== null && (!isUuid(afterId) || afterId === listId)) {
    return INVALID;
  }
  return done(await moveList(spaceId, user.id, listId, afterId));
}

export async function resetListAction(
  listId: string,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!isUuid(listId)) return LIST_NOT_FOUND;
  return done(await resetList(spaceId, user.id, listId));
}

// Redirects on success: re-rendering the current route would hit notFound().
export async function deleteListAction(
  listId: string,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!isUuid(listId)) return LIST_NOT_FOUND;
  const result = await deleteList(spaceId, user.id, listId);
  if (!result.ok) return LIST_NOT_FOUND;
  revalidateFor("list");
  redirect("/lists", RedirectType.replace);
}

export async function addItemAction(
  listId: string,
  text: unknown,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!isUuid(listId)) return LIST_NOT_FOUND;
  const parsed = ItemText.safeParse(text);
  if (!parsed.success) return INVALID;
  const result = await addItem(spaceId, user.id, listId, parsed.data);
  if (!result.ok) return LIST_NOT_FOUND;
  revalidateFor("list");
  return { ok: true, data: null };
}

export async function setItemTextAction(
  listId: string,
  itemId: string,
  text: unknown,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!isUuid(listId)) return LIST_NOT_FOUND;
  if (!isUuid(itemId)) return ITEM_NOT_FOUND;
  const parsed = ItemText.safeParse(text);
  if (!parsed.success) return INVALID;
  const result = await setItemText(spaceId, user.id, listId, itemId, parsed.data);
  return await itemDone(result, spaceId, user.id, listId);
}

export async function setItemCheckedAction(
  listId: string,
  itemId: string,
  checked: unknown,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!isUuid(listId)) return LIST_NOT_FOUND;
  if (!isUuid(itemId)) return ITEM_NOT_FOUND;
  const parsed = z.boolean().safeParse(checked);
  if (!parsed.success) return INVALID;
  const result = await setItemChecked(spaceId, user.id, listId, itemId, parsed.data);
  return await itemDone(result, spaceId, user.id, listId);
}

export async function deleteItemAction(
  listId: string,
  itemId: string,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!isUuid(listId)) return LIST_NOT_FOUND;
  if (!isUuid(itemId)) return ITEM_NOT_FOUND;
  const result = await deleteItem(spaceId, user.id, listId, itemId);
  return await itemDone(result, spaceId, user.id, listId);
}
