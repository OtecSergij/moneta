"use server";

import { z } from "zod";
import { requireSession } from "@/lib/dal";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import { type ConvertibleRow, convertRow } from "@/lib/fx/convert";
import {
  type FxDeps,
  OFFICIAL_HISTORY_FLOOR,
  maxEntryDate,
} from "@/lib/fx/provider";
import {
  FOREGROUND_RATE_BUDGET_MS,
  ensureRates,
  loadRateIndex,
} from "@/repositories/fx-rates";
import { getUserSettings } from "@/repositories/user-settings";
import { INVALID, type ActionResult } from "./types";

// A thunk, not a captured reference — see src/repositories/fx-rates.ts.
const defaultDeps: FxDeps = { fetch: (...args) => globalThis.fetch(...args) };

// This action is the only place a *client-chosen* date reaches the fetchers,
// and registration is open, so without a cap one signed-in caller could walk
// spentAt across the whole allowed window and turn each step into four
// outbound requests to CBR / NBS / jsDelivr.
//
// Counted per distinct date, not per call: that is the axis an abuser has to
// move along to cost anything (a repeat of a date already seen is answered by
// fx-rates.ts's own in-flight and negative caches), and it leaves someone
// editing one expense unaffected however long they fiddle with the amount.
// Past the cap the quote still answers, from whatever is already stored.
const FILL_QUOTA_DATES = 30;
const FILL_WINDOW_MS = 60_000;
const fillQuota = new Map<string, { dates: Set<string>; resetAt: number }>();

function mayTriggerFill(userId: string, date: string): boolean {
  const now = Date.now();
  const entry = fillQuota.get(userId);
  if (!entry || now >= entry.resetAt) {
    fillQuota.set(userId, {
      dates: new Set([date]),
      resetAt: now + FILL_WINDOW_MS,
    });
    return true;
  }
  if (entry.dates.has(date)) return true;
  if (entry.dates.size >= FILL_QUOTA_DATES) {
    console.warn("fx.quote_fill_quota_exceeded", { userId });
    return false;
  }
  entry.dates.add(date);
  return true;
}

// Same bounds as the provider itself: outside this window there is no
// snapshot to convert against, so validation rejects it before any network
// call. Upper bound is maxEntryDate(), not today: a client's clock can
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

// Live preview for the expense and top-up forms. requireSession comes first, before any
// parsing — actions are reachable via direct POST, and this one triggers
// outbound fetches, so an unauthenticated caller must never reach them.
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

  // Budgeted: the preview is on the typing path, so a slow source must
  // degrade to «курс недоступен», not stall the field.
  if (mayTriggerFill(user.id, spentAt)) {
    await ensureRates(spentAt, defaultDeps, FOREGROUND_RATE_BUDGET_MS);
  }

  const row: ConvertibleRow = { amountMinor, currency, spentAt };
  const index = await loadRateIndex([...CURRENCY_CODES], spentAt);
  const convertedMinor = convertRow(row, displayCurrency, index);

  return { ok: true, data: { convertedMinor, displayCurrency } };
}
