import { revalidatePath } from "next/cache";

export type RevalidateEvent =
  | "expense"
  | "category"
  | "displayCurrency"
  | "invite"
  | "list"
  | "account"
  | "topUp"
  | "transfer";

const PATHS: Record<RevalidateEvent, readonly string[]> = {
  expense: ["/", "/history", "/accounts"],
  category: ["/", "/history"],
  displayCurrency: ["/", "/history", "/accounts"],
  invite: ["/settings"],
  list: ["/lists"],
  account: ["/accounts", "/", "/history"],
  topUp: ["/accounts"],
  transfer: ["/accounts"],
};

const ACCOUNT_PAGE_EVENTS: ReadonlySet<RevalidateEvent> = new Set([
  "expense",
  "account",
  "displayCurrency",
  "category",
  "topUp",
  "transfer",
]);

export function revalidateFor(event: RevalidateEvent): void {
  for (const path of PATHS[event]) revalidatePath(path);
  if (event === "list") revalidatePath("/lists/[id]", "page");
  if (ACCOUNT_PAGE_EVENTS.has(event)) revalidatePath("/accounts/[id]", "page");
}
