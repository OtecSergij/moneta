import { vi } from "vitest";
import type { CurrencyCode } from "@/lib/currency";
import { type RateIndex, parseRate } from "@/lib/fx/convert";

// Fixture builders for the FX sources, shared by the provider unit tests and
// the fx_rates integration tests — one place that knows each source's shape
// (see src/lib/fx/provider.ts for the endpoints they imitate).

// windows-1251 maps the Cyrillic block U+0410..U+044F onto 0xC0..0xFF in
// order; that plus ASCII and Ё/ё is all a CBR fixture needs, and hand-rolling
// it keeps the encoded bytes out of the repository.
export function encodeWindows1251(text: string): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) bytes.push(cp);
    else if (cp >= 0x410 && cp <= 0x44f) bytes.push(cp - 0x410 + 0xc0);
    else if (cp === 0x401) bytes.push(0xa8);
    else if (cp === 0x451) bytes.push(0xb8);
    else throw new Error(`not encodable in windows-1251: ${ch}`);
  }
  return new Uint8Array(bytes);
}

export interface CbrDocumentOptions {
  /** The list's own date, "YYYY-MM-DD" (rendered as DD.MM.YYYY like CBR does). */
  date: string;
  /** USD `Value` with CBR's decimal comma, e.g. "86,3793". */
  usdValue?: string;
  usdNominal?: number;
  /** Drop the USD entry altogether. */
  omitUsd?: boolean;
}

// CBR's XML_daily.asp answer, as windows-1251 bytes. JPY (Nominal 100) sits
// before USD so a parser that grabbed the first Valute would be caught.
export function cbrDocument(opts: CbrDocumentOptions): Uint8Array<ArrayBuffer> {
  const [y, m, d] = opts.date.split("-");
  const usd = opts.omitUsd
    ? ""
    : `<Valute ID="R01235"><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>${opts.usdNominal ?? 1}</Nominal><Name>Доллар США</Name><Value>${opts.usdValue ?? "86,3793"}</Value><VunitRate>86,3793</VunitRate></Valute>`;
  return encodeWindows1251(
    `<?xml version="1.0" encoding="windows-1251"?><ValCurs Date="${d}.${m}.${y}" name="Foreign Currency Market">` +
      `<Valute ID="R01820"><NumCode>392</NumCode><CharCode>JPY</CharCode><Nominal>100</Nominal><Name>Японских иен</Name><Value>58,1234</Value><VunitRate>0,581234</VunitRate></Valute>` +
      usd +
      `<Valute ID="R01239"><NumCode>978</NumCode><CharCode>EUR</CharCode><Nominal>1</Nominal><Name>Евро</Name><Value>100,4050</Value><VunitRate>100,4050</VunitRate></Valute>` +
      `</ValCurs>`,
  );
}

export interface EcbPointFixture {
  date: string;
  usd: string;
}

// An ECB eurofxref file: the daily one quotes attributes with single quotes,
// the 90-day and full-history ones with double quotes. Days are emitted
// newest first, as the real files are.
export function ecbDocument(
  points: EcbPointFixture[],
  quote: '"' | "'" = '"',
): string {
  const q = quote;
  const days = [...points]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map(
      (p) =>
        `<Cube time=${q}${p.date}${q}><Cube currency=${q}USD${q} rate=${q}${p.usd}${q}/><Cube currency=${q}JPY${q} rate=${q}181.59${q}/></Cube>`,
    )
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?><gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">` +
    `<gesmes:subject>Reference rates</gesmes:subject><gesmes:Sender><gesmes:name>European Central Bank</gesmes:name></gesmes:Sender>` +
    `<Cube>${days}</Cube></gesmes:Envelope>`
  );
}

export interface NbsPayloadOptions {
  date: string;
  dateFrom?: string;
  /** Anything, so a test can hand the parser garbage. */
  middle?: unknown;
  parity?: unknown;
}

// kurs.resenje.org's answer for the NBS USD list on a date.
export function nbsPayload(opts: NbsPayloadOptions): string {
  return JSON.stringify({
    code: "USD",
    date: opts.date,
    date_from: opts.dateFrom ?? opts.date,
    number: 168,
    parity: "parity" in opts ? opts.parity : 1,
    cash_buy: 100.7762,
    cash_sell: 101.3826,
    exchange_buy: 100.7762,
    exchange_middle: "middle" in opts ? opts.middle : 101.0794,
    exchange_sell: 101.3826,
  });
}

// A literal scientific-notation example: a raw JSON string, not
// `JSON.stringify`'d from a JS number, so the "e-05" form survives into the
// parser exactly as jsDelivr would send it.
export const AGGREGATOR_RATES =
  '"usd":1,"rub":96.5,"eur":0.923,"rsd":107.7,"btc":1.2692964e-05';

export function aggregatorPayload(
  date: string | undefined,
  rates: string = AGGREGATOR_RATES,
): string {
  return date === undefined
    ? `{"usd":{${rates}}}`
    : `{"date":"${date}","usd":{${rates}}}`;
}

export type FxSourceName = "cbr" | "ecb" | "nbs" | "aggregator";

export function fxSourceOf(url: string): FxSourceName | null {
  if (url.includes("cbr.ru")) return "cbr";
  if (url.includes("ecb.europa.eu")) return "ecb";
  if (url.includes("kurs.resenje.org")) return "nbs";
  if (url.includes("currency-api")) return "aggregator";
  return null;
}

export interface FxSourcesOptions {
  /** Working days the ECB files answer with (the same document serves both). */
  ecbDates?: string[];
  ecbRate?: (date: string) => string;
  /** Sources answering 503 instead. */
  fail?: FxSourceName[];
  cbrValue?: string;
  nbsMiddle?: number;
  /** Raw `usd` object body for the aggregator; defaults to all four quotes. */
  aggregatorRates?: string;
  /** The aggregator payload's own `date`, given the tag the URL asked for. */
  aggregatorDate?: (tag: string | undefined) => string | undefined;
}

// One fetch stub answering every source by URL, each with a document of its
// real shape — CBR echoes the requested day as the list's date (a business
// day, so no in-force shift), NBS likewise, the aggregator dates its payload
// by the URL tag unless told otherwise.
export function stubFxSources(opts: FxSourcesOptions = {}) {
  const failing = new Set(opts.fail ?? []);
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    const source = fxSourceOf(u);
    if (source === null || failing.has(source)) {
      return new Response("", { status: 503 });
    }
    switch (source) {
      case "cbr": {
        const m = /date_req=(\d{2})\/(\d{2})\/(\d{4})/.exec(u)!;
        return new Response(
          cbrDocument({ date: `${m[3]}-${m[2]}-${m[1]}`, usdValue: opts.cbrValue }),
          { status: 200 },
        );
      }
      case "ecb":
        return new Response(
          ecbDocument(
            (opts.ecbDates ?? []).map((date) => ({
              date,
              usd: opts.ecbRate?.(date) ?? "1.1622",
            })),
          ),
          { status: 200 },
        );
      case "nbs": {
        const date = u.slice(-10);
        return new Response(nbsPayload({ date, middle: opts.nbsMiddle ?? 101.0794 }), {
          status: 200,
        });
      }
      case "aggregator": {
        const tag = /@(\d{4}-\d{2}-\d{2})/.exec(u)?.[1];
        const date = opts.aggregatorDate ? opts.aggregatorDate(tag) : tag;
        return new Response(aggregatorPayload(date, opts.aggregatorRates), {
          status: 200,
        });
      }
    }
  });
}

export function callsTo(
  fetch: ReturnType<typeof stubFxSources>,
  source: FxSourceName,
): string[] {
  return fetch.mock.calls
    .map((call) => String(call[0]))
    .filter((url) => fxSourceOf(url) === source);
}

export const FIXED_RATE_DATE = "2026-09-01";

// USD per unit: 1 EUR = 1.1 $, 80 ₽ = 1 $, 100 RSD = 1 $, 1 ₿ = 100 000 $.
export const FIXED_RATES: Record<CurrencyCode, string> = {
  USD: "1",
  EUR: "1.1",
  RUB: "0.0125",
  RSD: "0.01",
  BTC: "100000",
};

export function fixedRateIndex(
  rates: Partial<Record<CurrencyCode, string>> = FIXED_RATES,
): RateIndex {
  const index: RateIndex = new Map();
  for (const [currency, rate] of Object.entries(rates) as Array<[CurrencyCode, string]>) {
    index.set(currency, [{ effectiveDate: FIXED_RATE_DATE, rateToUsd: parseRate(rate) }]);
  }
  return index;
}
