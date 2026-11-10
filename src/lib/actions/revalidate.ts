import { revalidatePath } from "next/cache";

export type RevalidateEvent = "expense" | "category" | "displayCurrency" | "invite" | "list" | "account";

const PATHS: Record<RevalidateEvent, readonly string[]> = {
  expense: ["/", "/history", "/accounts"],
  category: ["/", "/history"],
  displayCurrency: ["/", "/history", "/accounts"],
  invite: ["/settings"],
  list: ["/lists"],
  account: ["/accounts", "/", "/history"],
};

export function revalidateFor(event: RevalidateEvent): void {
  for (const path of PATHS[event]) revalidatePath(path);
  if (event === "list") revalidatePath("/lists/[id]", "page");
}
