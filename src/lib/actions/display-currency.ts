"use server";

import { after } from "next/server";
import { requireSpace } from "@/lib/dal";
import type { CurrencyCode } from "@/lib/currency";
import {
  DisplayCurrencyInput,
  setDisplayCurrency,
} from "@/repositories/user-settings";
import { syncSpaceRates } from "@/repositories/fx-rates";
import { revalidateFor } from "./revalidate";
import type { ActionResult } from "./types";

// Like every action: reachable via direct POST, so verify auth and re-validate
// input server-side. Never trust the client.
export async function setDisplayCurrencyAction(
  input: unknown,
): Promise<ActionResult<CurrencyCode>> {
  const { user, spaceId } = await requireSpace();
  const parsed = DisplayCurrencyInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Проверьте выбранную валюту" };
  }

  const displayCurrency = await setDisplayCurrency(user.id, parsed.data);

  revalidateFor("displayCurrency");

  // cookies()/headers() aren't callable inside an after() callback, so the
  // space id is resolved here and closed over rather than re-derived inside.
  after(() => syncSpaceRates(spaceId));

  return { ok: true, data: displayCurrency };
}
