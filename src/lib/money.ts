// Money formatting + parsing. Single source of truth — every monetary value in
// the UI goes through here (see CLAUDE.md "UI / язык").
//
// Invariants:
//   - Amounts are stored as INTEGER minor units at currency.exponent precision
//     (kopecks for RUB, satoshi for BTC). Never floats.
//   - Display: symbol after the number (Russian convention), NBSP between
//     number and symbol, narrow no-break space (U+202F) between thousand groups, comma as decimal
//     separator. Fraction is rounded (half-even) to currency.displayDigits and
//     omitted entirely when it rounds to zero; BTC additionally strips
//     trailing zeros from the remaining digits.

import { type CurrencyCode, currencyMeta } from "@/lib/currency";
import { divRoundHalfEven } from "@/lib/half-even";

const NBSP = "\u00A0"; // U+00A0 non-breaking space — keeps the number glued to the symbol
const THIN = "\u202F"; // U+202F narrow no-break space — thousands separator

// "12480" -> "12 480" (THIN space between groups of three from the right).
function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

// A no-op whenever scale is 1 (every currency except RSD, whose para never
// print), which is why the bigint round-trip is worth skipping first.
function roundHalfEven(amount: number, scale: number): number {
  if (scale === 1) return amount;
  return Number(divRoundHalfEven(BigInt(amount), BigInt(scale)));
}

/**
 * Format INTEGER minor units for display: `formatMoney(1248050, "RUB")` ->
 * "12 480,50 ₽". Negative values get a leading minus (not expected in MVP,
 * handled defensively).
 */
export function formatMoney(amountMinor: number, currency: CurrencyCode): string {
  const meta = currencyMeta(currency);
  const negative = amountMinor < 0;
  const abs = Math.abs(Math.trunc(amountMinor));

  const scale = 10 ** (meta.exponent - meta.displayDigits);
  const displayMinor = roundHalfEven(abs, scale);

  const unit = 10 ** meta.displayDigits;
  const major = Math.floor(displayMinor / unit);
  const fracValue = displayMinor % unit;

  let fracStr = "";
  if (fracValue !== 0) {
    fracStr = String(fracValue).padStart(meta.displayDigits, "0");
    if (meta.trimFraction) fracStr = fracStr.replace(/0+$/, "");
  }

  const intPart = groupThousands(String(major));
  const body = fracStr === "" ? intPart : `${intPart},${fracStr}`;
  const sign = negative ? "-" : "";

  return `${sign}${body}${NBSP}${meta.symbol}`;
}

/**
 * Parse user input into INTEGER minor units, or `null` if not a valid amount.
 * Accepts grouping spaces (regular/NBSP/thin) and either "," or "." as decimal
 * separator. Rejects more fractional digits than the currency's `exponent`
 * (we never silently round money).
 *
 *   parseMoney("12 480,50", "RUB") -> 1248050
 *   parseMoney("0,00004507", "BTC") -> 4507
 *   parseMoney("10.999", "RUB")    -> null
 */
export function parseMoney(input: string, currency: CurrencyCode): number | null {
  if (typeof input !== "string") return null;
  const meta = currencyMeta(currency);

  // \s already matches NBSP (U+00A0) and the narrow no-break space (U+202F).
  const cleaned = input.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return null;

  const pattern = new RegExp(`^\\d+(\\.\\d{1,${meta.exponent}})?$`);
  if (!pattern.test(cleaned)) return null;

  const [intPart, fracPart = ""] = cleaned.split(".");
  const frac = fracPart.padEnd(meta.exponent, "0");
  const minor = Number(intPart) * 10 ** meta.exponent + Number(frac);

  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Convert minor units back to a plain editable string (comma decimal, no
 * grouping) for prefilling an edit form: `minorToInput(1248050, "RUB")` ->
 * "12480,50". Uses `exponent`, not `displayDigits` — editing an RSD expense
 * must round-trip its para, even though they're never shown when formatted.
 */
export function minorToInput(amountMinor: number, currency: CurrencyCode): string {
  const meta = currencyMeta(currency);
  const truncated = Math.trunc(amountMinor);
  const sign = truncated < 0 ? "-" : "";
  const abs = Math.abs(truncated);
  const unit = 10 ** meta.exponent;
  const major = Math.floor(abs / unit);
  const fracValue = abs % unit;

  return fracValue === 0
    ? `${sign}${major}`
    : `${sign}${major},${String(fracValue).padStart(meta.exponent, "0")}`;
}
