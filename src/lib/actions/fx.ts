"use server";

import { z } from "zod";
import { requireSession } from "@/lib/dal";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import { type ConvertibleRow, convertRow } from "@/lib/fx/convert";
import { OFFICIAL_HISTORY_FLOOR, maxEntryDate } from "@/lib/fx/provider";
import { loadRatesOn } from "@/repositories/fx-rates";
import { getUserSettings } from "@/repositories/user-settings";
import { INVALID, type ActionResult } from "./types";

// Same bounds as the provider itself: outside this window there is no
// snapshot to convert against, so validation rejects it before any query.
// Upper bound is maxEntryDate(), not today: a client's clock can
// legitimately be a day ahead of this server's (see provider.ts).
const QuoteConversionInput = z
  .object({
    amountMinor: z.int().positive(),
    currency: z.enum(CURRENCY_CODES),
    spentAt: z.iso.date(),
  })
  .refine(
    (v) => v.spentAt >= OFFICIAL_HISTORY_FLOOR && v.spentAt <= maxEntryDate(),
    { message: "Дата вне диапазона", path: ["spentAt"] },
  );

// Live preview for the expense and top-up forms, read from fx_rates only.
// requireSession comes first, before any parsing — actions are reachable via
// direct POST, and an unauthenticated caller must never reach the database.
export async function quoteConversionAction(
  input: unknown,
): Promise<
  ActionResult<{ convertedMinor: number | null; displayCurrency: CurrencyCode }>
> {
  const { user } = await requireSession();
  const parsed = QuoteConversionInput.safeParse(input);
  if (!parsed.success) return INVALID;
  const { amountMinor, currency, spentAt } = parsed.data;

  // Display currency lives behind the session — never accepted from the
  // client.
  const { displayCurrency } = await getUserSettings(user.id);

  const row: ConvertibleRow = { amountMinor, currency, spentAt };
  const currencies = currency === displayCurrency ? [currency] : [currency, displayCurrency];
  const index = await loadRatesOn(currencies, spentAt);
  const convertedMinor = convertRow(row, displayCurrency, index);

  return { ok: true, data: { convertedMinor, displayCurrency } };
}
