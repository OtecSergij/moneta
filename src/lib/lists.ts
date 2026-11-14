import { z } from "zod";
import type { ActionResultWithNotFound } from "@/lib/actions/types";

export const LIST_NAME_MAX = 60;
export const ITEM_TEXT_MAX = 200;

export const LIST_VISIBILITIES = ["shared", "private"] as const;
export type ListVisibility = (typeof LIST_VISIBILITIES)[number];

export const ListName = z.string().trim().min(1).max(LIST_NAME_MAX);

export const ListInput = z.object({
  name: ListName,
  visibility: z.enum(LIST_VISIBILITIES),
});
export type ListInput = z.infer<typeof ListInput>;

export const ItemText = z.string().trim().min(1).max(ITEM_TEXT_MAX);

export type ListActionResult<T> = ActionResultWithNotFound<T>;
