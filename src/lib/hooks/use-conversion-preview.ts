"use client";

import { useEffect, useState } from "react";
import { type CurrencyCode } from "@/lib/currency";
import { formatMoney } from "@/lib/money";
import { quoteConversionAction } from "@/lib/actions/fx";

const PREVIEW_DEBOUNCE_MS = 300;

type ConversionQuote =
  | { status: "unavailable" }
  | { status: "value"; convertedMinor: number; displayCurrency: CurrencyCode };

type VisiblePreview = { status: "pending" } | ConversionQuote;

function previewLabel(preview: VisiblePreview): string {
  if (preview.status === "value") {
    return `≈ ${formatMoney(preview.convertedMinor, preview.displayCurrency)}`;
  }
  return preview.status === "unavailable" ? "Курс недоступен" : "≈ …";
}

export function useConversionPreview({
  amountMinor,
  currency,
  displayCurrency,
  date,
}: {
  amountMinor: number | null;
  currency: CurrencyCode;
  displayCurrency: CurrencyCode;
  date: string;
}): string | null {
  // With matching currencies convert.ts's identity rule returns exactly the
  // entered amount, so there is nothing to show and no quote to request.
  const currenciesDiffer = currency !== displayCurrency;

  const previewKey =
    currenciesDiffer && amountMinor !== null && amountMinor > 0
      ? `${amountMinor}|${currency}|${displayCurrency}|${date}`
      : null;

  // Resolved answers are keyed by the exact inputs they answer for, so
  // "pending" vs. "resolved" falls out of a plain render-time comparison
  // below instead of a synchronous setState in the effect body
  // (react-hooks/set-state-in-effect) — the effect only ever calls setState
  // from inside the async callback.
  const [resolved, setResolved] = useState<{
    key: string;
    result: ConversionQuote;
  } | null>(null);

  // Debounced live preview: quoteConversionAction is a server round-trip, so
  // typing shouldn't fire it on every keystroke, and a failure must never
  // block the amount input itself.
  useEffect(() => {
    if (previewKey === null) return;

    let cancelled = false;
    const key = previewKey;
    const timer = setTimeout(() => {
      quoteConversionAction({ amountMinor, currency, spentAt: date }).then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setResolved({ key, result: { status: "unavailable" } });
          return;
        }
        const { convertedMinor, displayCurrency: quotedIn } = res.data;
        setResolved({
          key,
          result:
            convertedMinor === null
              ? { status: "unavailable" }
              : { status: "value", convertedMinor, displayCurrency: quotedIn },
        });
      }).catch(() => {
        // requireSession redirects by throwing; mid-typing that lands here
        // rather than as an unhandled rejection while the redirect proceeds.
        if (!cancelled) setResolved({ key, result: { status: "unavailable" } });
      });
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [previewKey, amountMinor, currency, date]);

  const preview: VisiblePreview | null =
    previewKey === null
      ? null
      : resolved && resolved.key === previewKey
        ? resolved.result
        : { status: "pending" };

  return preview ? previewLabel(preview) : null;
}
