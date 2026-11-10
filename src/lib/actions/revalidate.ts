import { revalidatePath } from "next/cache";

export type RevalidateEvent = "expense" | "category" | "displayCurrency" | "invite";

const PATHS: Record<RevalidateEvent, readonly string[]> = {
  expense: ["/", "/history"],
  category: ["/", "/history"],
  displayCurrency: ["/", "/history"],
  invite: ["/settings"],
};

export function revalidateFor(event: RevalidateEvent): void {
  for (const path of PATHS[event]) revalidatePath(path);
}
