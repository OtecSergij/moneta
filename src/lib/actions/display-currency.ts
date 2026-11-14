"use server";

import { requireSpace } from "@/lib/dal";
import {
  DisplayCurrencyInput,
  setDisplayCurrency,
} from "@/repositories/user-settings";
import { revalidateFor } from "./revalidate";
import type { ActionResult } from "./types";

// Like every action: reachable via direct POST, so verify auth and re-validate
// input server-side. Never trust the client.
export async function setDisplayCurrencyAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const { user } = await requireSpace();
  const parsed = DisplayCurrencyInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Проверьте выбранную валюту" };
  }

  await setDisplayCurrency(user.id, parsed.data);

  revalidateFor("displayCurrency");

  return { ok: true, data: null };
}
