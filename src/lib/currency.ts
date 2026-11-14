// Currency metadata — single source of truth for symbols, storage/display
// precision, and fx rate lookup windows.

export const CURRENCY_CODES = ["RUB", "USD", "EUR", "RSD", "BTC"] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

interface CurrencyMeta {
  code: CurrencyCode;
  symbol: string;
  // Russian display name, shown where the symbol alone would be
  // redundant or unrecognisable (the currency switcher).
  name: string;
  // Storage precision: amount_minor is in units of 10^-exponent.
  exponent: number;
  // Print precision. Split from `exponent` because RSD stores para (ISO 4217)
  // but is never quoted with them (CLDR cashDigits: 0) — rounded on display only.
  displayDigits: number;
  trimFraction: boolean;
}

const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  RUB: {
    code: "RUB",
    symbol: "₽",
    name: "Рубль",
    exponent: 2,
    displayDigits: 2,
    trimFraction: false,
  },
  USD: {
    code: "USD",
    symbol: "$",
    name: "Доллар",
    exponent: 2,
    displayDigits: 2,
    trimFraction: false,
  },
  EUR: {
    code: "EUR",
    symbol: "€",
    name: "Евро",
    exponent: 2,
    displayDigits: 2,
    trimFraction: false,
  },
  RSD: {
    code: "RSD",
    // The dinar has no Unicode sign of its own, unlike ₽ $ € ₿ — "дин" is an
    // abbreviation, not a currency symbol, so the ISO code reads better next
    // to the real signs.
    symbol: "RSD",
    name: "Динар",
    exponent: 2,
    displayDigits: 0,
    trimFraction: false,
  },
  BTC: {
    code: "BTC",
    symbol: "₿",
    name: "Биткоин",
    exponent: 8,
    displayDigits: 8,
    trimFraction: true,
  },
};

// `currency` reaches the app as a Postgres enum value. db/schema/expenses.ts
// builds that enum from CURRENCY_CODES, so the two can't drift through normal
// changes — but a hand-written migration could still add a label this file has
// never heard of, and a bare `CURRENCIES[code]` would then hand every caller
// `undefined` and 500 the page on `meta.exponent`. Degrading to the raw code
// keeps the row readable, the way the pre-multi-currency `symbolFor` did.
const UNKNOWN_EXPONENT = 2;

export function currencyMeta(code: CurrencyCode): CurrencyMeta {
  const meta = CURRENCIES[code];
  if (meta) return meta;
  console.warn("currency.unknown_code", { code });
  return {
    code,
    symbol: code,
    name: code,
    exponent: UNKNOWN_EXPONENT,
    displayDigits: UNKNOWN_EXPONENT,
    trimFraction: false,
  };
}
