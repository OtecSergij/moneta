import type { CurrencyCode } from "@/lib/currency";

// Answer of the live conversion quote (quoteConversionAction).
export type ConversionQuote =
  | { status: "unavailable" }
  | { status: "value"; convertedMinor: number; displayCurrency: CurrencyCode };

export type VisiblePreview = { status: "pending" } | ConversionQuote;

// "empty" is not "no rate" — it means the amount field doesn't hold a
// positive number yet, so there is nothing to convert and nothing to fix.
export type ConversionPreview = { status: "empty" } | VisiblePreview;

export type FixationSlot =
  | { kind: "hidden" }
  | { kind: "prompt" }
  | { kind: "preview-action"; preview: VisiblePreview }
  | { kind: "preview-status"; preview: VisiblePreview };

/**
 * Picks what the single status slot under the amount shows.
 *
 * The slot carries two jobs at once: it reports the converted amount, and it
 * is the way into the charged-amount fixation. Those jobs have different
 * conditions — a conversion is only meaningful when the currencies differ,
 * but recording what the bank actually debited is a fact about the expense
 * that matters no matter which display currency happens to be selected (it
 * changes the row's value in every *other* display currency, permanently).
 * Keeping both in one slot keeps one tap target under the amount.
 *
 * `preview` is ignored while the currencies match: no quote is requested in
 * that case, since convert.ts's identity rule would return the entered amount.
 */
export function resolveFixationSlot({
  currenciesDiffer,
  panelOpen,
  preview,
}: {
  currenciesDiffer: boolean;
  panelOpen: boolean;
  preview: ConversionPreview;
}): FixationSlot {
  if (preview.status === "empty") return { kind: "hidden" };

  if (!currenciesDiffer) {
    // With the panel open the panel itself is the affordance, and an identity
    // conversion has nothing to report.
    return panelOpen ? { kind: "hidden" } : { kind: "prompt" };
  }

  // Still worth showing with the panel open — the preview is fixation-aware,
  // so it reports what the entered charge implies in the display currency —
  // but it is no longer a way in, so it stops being a tap target.
  return panelOpen
    ? { kind: "preview-status", preview }
    : { kind: "preview-action", preview };
}
