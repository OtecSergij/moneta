import { revalidatePath } from "next/cache";

export type RevalidateEvent = "expense" | "category" | "displayCurrency" | "invite" | "list";

const PATHS: Record<RevalidateEvent, readonly string[]> = {
  expense: ["/", "/history"],
  category: ["/", "/history"],
  displayCurrency: ["/", "/history"],
  invite: ["/settings"],
  list: ["/lists"],
};

export function revalidateFor(event: RevalidateEvent): void {
  for (const path of PATHS[event]) revalidatePath(path);
  if (event === "list") revalidatePath("/lists/[id]", "page");
}
