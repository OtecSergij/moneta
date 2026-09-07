"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireSession } from "@/lib/dal";
import type { CurrencyCode } from "@/lib/currency";
import {
  DisplayCurrencyInput,
  setDisplayCurrency,
} from "@/repositories/user-settings";
import { syncUserRates } from "@/repositories/fx-rates";
import type { ActionResult } from "./types";

// Like every action: reachable via direct POST, so verify auth and re-validate
// input server-side. Never trust the client.
export async function setDisplayCurrencyAction(
  input: unknown,
): Promise<ActionResult<CurrencyCode>> {
  const { user } = await requireSession();
  const parsed = DisplayCurrencyInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Проверьте выбранную валюту" };
  }

  const displayCurrency = await setDisplayCurrency(user.id, parsed.data);

  // The switcher appears on all three, and /settings is a dynamic server
  // component reading the setting server-side — skipping it would leave
  // that page showing the old currency.
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/settings");

  // cookies()/headers() aren't callable inside an after() callback, so the
  // user id is resolved here and closed over rather than re-derived inside.
  const userId = user.id;
  after(() => syncUserRates(userId));

  return { ok: true, data: displayCurrency };
}
