"use server";

import { RedirectType, redirect } from "next/navigation";
import { z } from "zod";
import { requireSpace } from "@/lib/dal";
import { ItemText, ListInput, ListName, type ListActionResult } from "@/lib/lists";
import {
  addItem,
  createList,
  deleteItem,
  deleteList,
  renameList,
  resetList,
  setItemChecked,
  setItemText,
  setListVisibility,
  type ListItem,
  type ListOpResult,
} from "@/repositories/lists";
import { revalidateFor } from "./revalidate";

const Id = z.uuid();
const Visibility = ListInput.shape.visibility;

const INVALID = { ok: false, error: "Проверьте поля формы" } as const;
const LIST_NOT_FOUND = { ok: false, error: "Список не найден", notFound: true } as const;
const ITEM_NOT_FOUND = { ok: false, error: "Пункт не найден", notFound: true } as const;

function done(
  result: ListOpResult,
  notFound: typeof LIST_NOT_FOUND | typeof ITEM_NOT_FOUND,
): ListActionResult<null> {
  if (!result.ok) return notFound;
  revalidateFor("list");
  return { ok: true, data: null };
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
  if (!Id.safeParse(listId).success) return LIST_NOT_FOUND;
  const parsed = ListName.safeParse(name);
  if (!parsed.success) return INVALID;
  return done(await renameList(spaceId, user.id, listId, parsed.data), LIST_NOT_FOUND);
}

export async function setListVisibilityAction(
  listId: string,
  visibility: unknown,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!Id.safeParse(listId).success) return LIST_NOT_FOUND;
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

export async function resetListAction(
  listId: string,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!Id.safeParse(listId).success) return LIST_NOT_FOUND;
  return done(await resetList(spaceId, user.id, listId), LIST_NOT_FOUND);
}

// Redirects on success: re-rendering the current route would hit notFound().
export async function deleteListAction(
  listId: string,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!Id.safeParse(listId).success) return LIST_NOT_FOUND;
  const result = await deleteList(spaceId, user.id, listId);
  if (!result.ok) return LIST_NOT_FOUND;
  revalidateFor("list");
  redirect("/lists", RedirectType.replace);
}

export async function addItemAction(
  listId: string,
  text: unknown,
): Promise<ListActionResult<ListItem>> {
  const { user, spaceId } = await requireSpace();
  if (!Id.safeParse(listId).success) return LIST_NOT_FOUND;
  const parsed = ItemText.safeParse(text);
  if (!parsed.success) return INVALID;
  const result = await addItem(spaceId, user.id, listId, parsed.data);
  if (!result.ok) return LIST_NOT_FOUND;
  revalidateFor("list");
  return { ok: true, data: result.item };
}

export async function setItemTextAction(
  itemId: string,
  text: unknown,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!Id.safeParse(itemId).success) return ITEM_NOT_FOUND;
  const parsed = ItemText.safeParse(text);
  if (!parsed.success) return INVALID;
  return done(await setItemText(spaceId, user.id, itemId, parsed.data), ITEM_NOT_FOUND);
}

export async function setItemCheckedAction(
  itemId: string,
  checked: unknown,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!Id.safeParse(itemId).success) return ITEM_NOT_FOUND;
  const parsed = z.boolean().safeParse(checked);
  if (!parsed.success) return INVALID;
  return done(await setItemChecked(spaceId, user.id, itemId, parsed.data), ITEM_NOT_FOUND);
}

export async function deleteItemAction(
  itemId: string,
): Promise<ListActionResult<null>> {
  const { user, spaceId } = await requireSpace();
  if (!Id.safeParse(itemId).success) return ITEM_NOT_FOUND;
  return done(await deleteItem(spaceId, user.id, itemId), ITEM_NOT_FOUND);
}
