// Money formatting + parsing. Single source of truth — every monetary value in
// the UI goes through here (see CLAUDE.md "UI / язык").
//
// Invariants:
//   - Amounts are stored as INTEGER minor units (kopecks for RUB). Never floats.
//   - Display: symbol left, NBSP between symbol and number, narrow no-break
//     space (U+202F) between thousand groups, comma as decimal separator.
//     No decimals when there are no kopecks; otherwise exactly 2.
//     Examples: "₽ 12 480", "₽ 12 480,50", "₽ 0,99".

const NBSP = " "; // between symbol and value — keeps "₽" glued to the number
const THIN = " "; // narrow no-break space — thousands separator

// MVP is single-currency. The map exists so adding a currency later is one line
// here + the pgEnum (see db/schema/expenses.ts).
const CURRENCY_SYMBOL: Record<string, string> = {
  RUB: "₽",
};

function symbolFor(currency: string): string {
  return CURRENCY_SYMBOL[currency] ?? currency;
}

// "12480" -> "12 480" (THIN space between groups of three from the right).
function groupThousands(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

export interface FormatMoneyOpts {
  currency?: string;
}

/**
 * Format INTEGER minor units for display: `formatMoney(1248050)` -> "₽ 12 480,50".
 * Negative values get a leading minus (not expected in MVP, handled defensively).
 */
export function formatMoney(
  amountMinor: number,
  { currency = "RUB" }: FormatMoneyOpts = {},
): string {
  const negative = amountMinor < 0;
  const abs = Math.abs(Math.trunc(amountMinor));
  const major = Math.floor(abs / 100);
  const minor = abs % 100;

  const intPart = groupThousands(String(major));
  const body =
    minor === 0 ? intPart : `${intPart},${String(minor).padStart(2, "0")}`;

  return `${negative ? "-" : ""}${symbolFor(currency)}${NBSP}${body}`;
}

/**
 * Parse user input into INTEGER minor units, or `null` if not a valid amount.
 * Accepts grouping spaces (regular/NBSP/thin) and either "," or "." as decimal
 * separator. Rejects more than 2 fractional digits (we never silently round
 * money). Does NOT enforce positivity — the form's zod schema does that.
 *
 *   parseMoney("12 480,50") -> 1248050
 *   parseMoney("1234.5")    -> 123450
 *   parseMoney("10.999")    -> null
 */
export function parseMoney(input: string): number | null {
  if (typeof input !== "string") return null;

  // \s already matches NBSP (U+00A0) and the narrow no-break space (U+202F).
  const cleaned = input.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "" || !/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const [intPart, fracPart = ""] = cleaned.split(".");
  const frac = (fracPart + "00").slice(0, 2);
  const minor = Number(intPart) * 100 + Number(frac);

  return Number.isSafeInteger(minor) ? minor : null;
}

/**
 * Convert minor units back to a plain editable string (dot decimal, no
 * grouping) for prefilling an edit form: `minorToInput(1248050)` -> "12480.50".
 */
export function minorToInput(amountMinor: number): string {
  const abs = Math.abs(Math.trunc(amountMinor));
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  return minor === 0 ? String(major) : `${major}.${String(minor).padStart(2, "0")}`;
}
