// FX rate providers. Each fiat currency comes from the institution that
// officially publishes it — the Central Bank of Russia for RUB, the European
// Central Bank for EUR, the National Bank of Serbia (via kurs.resenje.org)
// for RSD — and BTC from a keyless aggregator snapshot. Every source quotes
// its pair against the USD pivot directly, so nothing here triangulates.
// No caller here talks to the database; src/repositories/fx-rates.ts owns
// persistence and calls into this module purely for network data.

import { addDays, subDays } from "date-fns";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import { parseISODate, toISODate, todayISO } from "@/lib/dates";
import { formatScaledRate, parseRate } from "@/lib/fx/convert";

// The aggregator — BTC's only source, and the fallback for fiat — has no
// snapshots before this date; requests below it would just 404 forever, so
// we skip the network entirely (plan Step 4.1).
export const PROVIDER_HISTORY_FLOOR = "2024-10-01";

// The official fiat sources reach much further back: ECB to 1999, CBR to the
// 1998 redenomination, NBS (as served by kurs.resenje.org) to 31 Dec 2002.
// The latest of the three bounds all of them, so "which currencies can exist
// for a date" stays a single rule (fetchableCurrencies below).
export const OFFICIAL_HISTORY_FLOOR = "2003-01-01";

// The browser computes `spentAt` in the user's own timezone (Serbia,
// UTC+1/2) while this server runs UTC, so between local midnight and the
// server's midnight the client's "today" is already the server's tomorrow.
// The UI's date picker already forbids a genuinely future date, so instead
// of rejecting (or misdating) a same-day entry, the server widens its own
// notion of "today" by one day forward. `maxEntryDate` is the validation
// upper bound (src/lib/actions/fx.ts); `isCurrentDate` backs every "is this
// today" gate a client's clock could legitimately push one day ahead: the
// live-BTC branch (src/repositories/expenses.ts), the `@latest` tag gate and
// the ECB carry-forward below.
export function maxEntryDate(now: Date = new Date()): string {
  return todayISO(addDays(now, 1));
}

export function isCurrentDate(iso: string, now: Date = new Date()): boolean {
  return iso >= todayISO(now);
}

/**
 * Currencies some source can still supply for `date` — what "fully covered"
 * means for it (ensureRates / backfillRates in src/repositories/fx-rates.ts).
 * BTC only exists from PROVIDER_HISTORY_FLOOR, the fiat set from
 * OFFICIAL_HISTORY_FLOOR; expecting all five on a 2019 date would leave it
 * uncovered forever and have every backfill pass re-fetch it.
 */
export function fetchableCurrencies(date: string): CurrencyCode[] {
  return CURRENCY_CODES.filter((code) => {
    if (code === "USD") return true;
    if (code === "BTC") return date >= PROVIDER_HISTORY_FLOOR;
    return date >= OFFICIAL_HISTORY_FLOOR;
  });
}

export interface FxDeps {
  fetch: typeof globalThis.fetch;
}

export type RateSource =
  | "cbr"
  | "ecb"
  | "nbs"
  | "jsdelivr"
  | "jsdelivr-latest"
  | "pivot";

export interface FetchedRate {
  currency: CurrencyCode;
  effectiveDate: string;
  rateToUsd: string;
  source: RateSource;
}

const REQUEST_TIMEOUT_MS = 2000;
// The full ECB history is several megabytes; the 2 s budget sized for a
// small document would abort it on an ordinary connection.
const ECB_HISTORY_TIMEOUT_MS = 10_000;
const ECB_RECENT_TTL_MS = 60 * 60 * 1000;
// Working days the ECB batch inserts around a requested date: the 90-day
// file whole, and the same span cut out of the full history, which would
// otherwise hand back seven thousand rows per request.
const ECB_BATCH_DAYS = 90;
const MIN_RATE = 1e-9;
const MAX_RATE = 1e9;

const CBR_URL = "https://www.cbr.ru/scripts/XML_daily.asp";
const ECB_RECENT_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";
const ECB_HISTORY_URL =
  "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml";
const NBS_URL = "https://kurs.resenje.org/api/v1/currencies/usd/rates";
const COINBASE_URL = "https://api.coinbase.com/v2/exchange-rates?currency=BTC";
const COINBASE_CACHE_MS = 60_000;

const USD_PIVOT_RATE = "1.00000000000000000000";

const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/;

function isValidRate(n: number): boolean {
  return Number.isFinite(n) && n > 0 && n >= MIN_RATE && n <= MAX_RATE;
}

// Same 1e-9…1e9 band as isValidRate above, expressed as a bigint at the
// 1e20 scale expenses.ts derives manual-fixation rates in (RATE_SCALE_DIGITS
// in convert.ts) — reused there so a user-derived override is sanity-checked
// against the exact band a fetched rate is, without a lossy Number
// comparison on a 20-fractional-digit value.
const RATE_SCALE_DIGITS = 20;
const MIN_RATE_SCALED = BigInt(10) ** BigInt(RATE_SCALE_DIGITS - 9); // 1e-9 scaled
const MAX_RATE_SCALED = BigInt(10) ** BigInt(RATE_SCALE_DIGITS + 9); // 1e9 scaled

export function isScaledRateInBand(scaledRate: bigint): boolean {
  return scaledRate >= MIN_RATE_SCALED && scaledRate <= MAX_RATE_SCALED;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

// Never throws, never leaves a hung request: Node's fetch has no default
// timeout, and a stalled quote request would block expense creation (plan
// Step 4.2). Returns null on any failure — callers decide what "no data"
// means for them.
async function fetchOk(
  url: string,
  deps: FxDeps,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Response | null> {
  try {
    const res = await deps.fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok ? res : null;
  } catch {
    return null;
  }
}

async function fetchJson(url: string, deps: FxDeps): Promise<unknown> {
  const res = await fetchOk(url, deps);
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchText(
  url: string,
  deps: FxDeps,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<string | null> {
  const res = await fetchOk(url, deps, timeoutMs);
  if (!res) return null;
  try {
    return await res.text();
  } catch {
    return null;
  }
}

// CBR serves windows-1251, which `Response.text()` decodes as UTF-8 and
// mangles; the raw bytes go through the right decoder instead.
async function fetchWindows1251(
  url: string,
  deps: FxDeps,
): Promise<string | null> {
  const res = await fetchOk(url, deps);
  if (!res) return null;
  try {
    return new TextDecoder("windows-1251").decode(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// Inverts `usd -> X` (units of X per 1 USD) into rate_to_usd (USD per unit
// of X), formatted for the numeric(36,20) column. `toFixed` rounds the
// double's exact value to the nearest representable decimal; true half-even
// tie-breaking only matters when the source can land exactly on a rounding
// boundary, which a floating-point division practically never does — unlike
// convert.ts's parseRate, which reads exact decimal strings out of Postgres
// and ties there are reachable, this is a one-way conversion from a ~8
// significant-digit source (plan Step 4.3).
function invertRate(unitsPerUsd: number): string | null {
  if (!Number.isFinite(unitsPerUsd) || unitsPerUsd <= 0) return null;
  const inverted = 1 / unitsPerUsd;
  return isValidRate(inverted) ? inverted.toFixed(20) : null;
}

const CBR_DOCUMENT_DATE = /<ValCurs\b[^>]*\sDate="(\d{2})\.(\d{2})\.(\d{4})"/;
const CBR_VALUTE = /<Valute\b[^>]*>([\s\S]*?)<\/Valute>/g;

/** RUB via the Central Bank of Russia's daily list. */
export async function fetchRubToUsd(
  date: string,
  deps: FxDeps,
): Promise<string | null> {
  if (date < OFFICIAL_HISTORY_FLOOR) return null;

  const [y, m, d] = date.split("-");
  const url = `${CBR_URL}?date_req=${d}/${m}/${y}`;
  const xml = await fetchWindows1251(url, deps);
  if (xml === null) {
    console.warn("fx.fetch_failed", { date, source: "cbr", url });
    return null;
  }

  // A non-business date returns the list in force on it, dated earlier —
  // that is the rate the bank itself applies to the day, so it counts. A
  // later list would not; CBR never serves one, so this only guards against
  // an unexpected response.
  const dateMatch = CBR_DOCUMENT_DATE.exec(xml);
  const documentDate = dateMatch
    ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
    : null;
  if (documentDate === null || documentDate > date) {
    console.warn("fx.invalid_rate", { date, source: "cbr", documentDate });
    return null;
  }

  for (const [, valute] of xml.matchAll(CBR_VALUTE)) {
    if (!valute.includes("<CharCode>USD</CharCode>")) continue;
    // Decimal comma, and a Nominal that is 1 for USD but 100 for several
    // other currencies: only Value / Nominal is a per-unit price.
    const nominal = Number(/<Nominal>(\d+)<\/Nominal>/.exec(valute)?.[1]);
    const value = Number(
      /<Value>([\d,]+)<\/Value>/.exec(valute)?.[1]?.replace(",", "."),
    );
    const inverted = nominal > 0 ? invertRate(value / nominal) : null;
    if (inverted === null) {
      console.warn("fx.invalid_rate", { date, source: "cbr", nominal, value });
    }
    return inverted;
  }

  console.warn("fx.invalid_rate", { date, source: "cbr", reason: "no USD entry" });
  return null;
}

export interface EcbPoint {
  effectiveDate: string;
  rateToUsd: string;
}

// The daily file quotes attributes with single quotes, the historical ones
// with double quotes.
const ECB_CUBE =
  /<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']|<Cube\s+currency=["']USD["']\s+rate=["']([^"']*)["']/g;

// The USD series of an ECB eurofxref file, ascending. `rate` is USD per
// 1 EUR — rate_to_usd for EUR as-is, canonicalised by exact string shifting.
function parseEcbUsdSeries(xml: string): EcbPoint[] | null {
  const points: EcbPoint[] = [];
  let current: string | null = null;
  for (const match of xml.matchAll(ECB_CUBE)) {
    if (match[1] !== undefined) {
      current = match[1];
      continue;
    }
    if (current === null) continue;
    const raw = match[2];
    if (!PLAIN_DECIMAL.test(raw) || !isValidRate(Number(raw))) {
      console.warn("fx.invalid_rate", { source: "ecb", date: current, raw });
      continue;
    }
    points.push({
      effectiveDate: current,
      rateToUsd: formatScaledRate(parseRate(raw)),
    });
  }
  if (points.length === 0) return null;
  points.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return points;
}

interface EcbCache {
  recent?: { series: Promise<EcbPoint[] | null>; at: number };
  history?: Promise<EcbPoint[] | null>;
}

// Keyed by the transport rather than module-global, so an injected fetch
// (tests, or a future proxy) never observes a series another one downloaded.
// Promises are cached, not results, so the backfill's parallel workers share
// one download instead of racing four.
const ecbCaches = new WeakMap<FxDeps["fetch"], EcbCache>();

function ecbCacheFor(deps: FxDeps): EcbCache {
  let cache = ecbCaches.get(deps.fetch);
  if (!cache) {
    cache = {};
    ecbCaches.set(deps.fetch, cache);
  }
  return cache;
}

async function loadEcbSeries(
  url: string,
  deps: FxDeps,
  timeoutMs: number,
): Promise<EcbPoint[] | null> {
  const xml = await fetchText(url, deps, timeoutMs);
  const series = xml === null ? null : parseEcbUsdSeries(xml);
  if (series === null) console.warn("fx.fetch_failed", { source: "ecb", url });
  return series;
}

function ecbRecentSeries(deps: FxDeps): Promise<EcbPoint[] | null> {
  const cache = ecbCacheFor(deps);
  if (cache.recent && Date.now() - cache.recent.at < ECB_RECENT_TTL_MS) {
    return cache.recent.series;
  }
  const entry = {
    series: loadEcbSeries(ECB_RECENT_URL, deps, REQUEST_TIMEOUT_MS),
    at: Date.now(),
  };
  cache.recent = entry;
  return entry.series.then((series) => {
    // A failed download must not occupy the slot for the whole TTL.
    if (series === null && cache.recent === entry) delete cache.recent;
    return series;
  });
}

function ecbHistorySeries(deps: FxDeps): Promise<EcbPoint[] | null> {
  const cache = ecbCacheFor(deps);
  if (cache.history) return cache.history;
  const series = loadEcbSeries(ECB_HISTORY_URL, deps, ECB_HISTORY_TIMEOUT_MS);
  cache.history = series;
  return series.then((result) => {
    if (result === null && cache.history === series) delete cache.history;
    return result;
  });
}

/**
 * EUR via the European Central Bank's reference rates. There is no per-date
 * endpoint, so the answer is a batch: every working day the file holds within
 * ECB_BATCH_DAYS of `date` (genuine determination dates, free to store), plus
 * `date` itself carrying the latest determination at or before it — so a
 * weekend or holiday request ends up covered. Null only when the needed file
 * could not be loaded; a batch that lacks `date` is not a failure.
 */
export async function fetchEurToUsdRange(
  date: string,
  deps: FxDeps,
): Promise<EcbPoint[] | null> {
  if (date < OFFICIAL_HISTORY_FLOOR) return null;

  const recent = await ecbRecentSeries(deps);
  if (recent === null) return null;
  // The full history never changes for dates the 90-day file already covers,
  // so its multi-megabyte download is reserved for older ones.
  const series =
    date >= recent[0].effectiveDate ? recent : await ecbHistorySeries(deps);
  if (series === null) return null;

  const day = parseISODate(date);
  const from = toISODate(subDays(day, ECB_BATCH_DAYS));
  const to = toISODate(addDays(day, ECB_BATCH_DAYS));
  const rows = series.filter(
    (p) => p.effectiveDate >= from && p.effectiveDate <= to,
  );

  // Skipped for today (or the client's today, one day ahead): the ECB
  // publishes at ~16:00 CET, and a row written before that would freeze
  // yesterday's rate onto today for good (the insert is onConflictDoNothing).
  // Left uncovered, today is simply retried until the real determination
  // lands; readers bridge the gap through the currency's lookback window.
  if (!rows.some((p) => p.effectiveDate === date) && !isCurrentDate(date)) {
    for (let i = series.length - 1; i >= 0; i--) {
      if (series[i].effectiveDate <= date) {
        rows.push({ effectiveDate: date, rateToUsd: series[i].rateToUsd });
        break;
      }
    }
  }
  return rows;
}

/** RSD via the National Bank of Serbia's middle rate, as served by kurs.resenje.org. */
export async function fetchRsdToUsd(
  date: string,
  deps: FxDeps,
): Promise<string | null> {
  if (date < OFFICIAL_HISTORY_FLOOR) return null;

  const url = `${NBS_URL}/${date}`;
  const payload = asRecord(await fetchJson(url, deps));
  if (!payload) {
    console.warn("fx.fetch_failed", { date, source: "nbs", url });
    return null;
  }

  // `date_from` is when the quoted list took effect; like CBR's, it stays in
  // force over a weekend. A list dated after the requested day cannot be
  // right for it.
  const dateFrom = payload.date_from;
  if (typeof dateFrom === "string" && dateFrom > date) {
    console.warn("fx.invalid_rate", { date, source: "nbs", dateFrom });
    return null;
  }

  const middle = payload.exchange_middle;
  const parity = payload.parity;
  const inverted =
    typeof middle === "number" && typeof parity === "number" && parity > 0
      ? invertRate(middle / parity)
      : null;
  if (inverted === null) {
    console.warn("fx.invalid_rate", { date, source: "nbs", middle, parity });
  }
  return inverted;
}

export interface AggregatorSnapshot {
  /**
   * The snapshot's OWN effective date, which is not always the requested one:
   * the `@latest` tag serves whatever day the provider last published, and
   * around the UTC date boundary that is yesterday (observed: `@latest` on
   * 2 Sept returning `date: 2026-09-01`). Callers must persist the rates under
   * this date — filing them under the requested date would mislabel them
   * permanently, and the primary key would then keep the real snapshot out.
   */
  date: string;
  source: "jsdelivr" | "jsdelivr-latest";
  rates: Partial<Record<Exclude<CurrencyCode, "USD">, string>>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The aggregator's daily snapshot — BTC's only source, and the fallback for
 * a fiat currency whose official source failed.
 */
export async function fetchAggregatorRates(
  date: string,
  deps: FxDeps,
): Promise<AggregatorSnapshot | null> {
  if (date < PROVIDER_HISTORY_FLOOR) return null;

  // @latest is only correct for today (or the client's today, one day
  // ahead of the server's — see isCurrentDate above): for any earlier date
  // it would silently substitute today's rate, breaking "rate on the
  // transaction date".
  const tag = isCurrentDate(date) ? "latest" : date;
  const primaryUrl = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/usd.min.json`;
  const mirrorUrl = `https://${tag}.currency-api.pages.dev/v1/currencies/usd.min.json`;

  let payload = asRecord(await fetchJson(primaryUrl, deps));
  if (!payload) {
    console.warn("fx.fetch_failed", { date, url: primaryUrl });
    payload = asRecord(await fetchJson(mirrorUrl, deps));
    if (!payload) {
      console.warn("fx.fetch_failed", { date, url: mirrorUrl });
    }
  }
  if (!payload) return null;

  const usdRates = asRecord(payload.usd);
  if (!usdRates) return null;

  // A dated tag can safely fall back to the requested date if the provider
  // ever drops the field: the two agree by construction. For `latest` they do
  // not, and guessing would file whatever day the provider last published
  // under the requested date permanently — the exact mislabeling this type
  // exists to prevent — so a `latest` payload without a valid date is refused.
  const hasPayloadDate =
    typeof payload.date === "string" && ISO_DATE.test(payload.date);
  if (!hasPayloadDate && tag === "latest") {
    console.warn("fx.fetch_failed", { date, reason: "latest payload without date" });
    return null;
  }
  const payloadDate = hasPayloadDate ? (payload.date as string) : date;

  // Partial on purpose: a single garbage currency in the payload shouldn't
  // discard the good ones. USD is the pivot, not a quote — fetchRates adds it.
  const rates: AggregatorSnapshot["rates"] = {};
  for (const code of CURRENCY_CODES) {
    if (code === "USD") continue;
    const raw = usdRates[code.toLowerCase()];
    const inverted = typeof raw === "number" ? invertRate(raw) : null;
    if (inverted === null) {
      console.warn("fx.invalid_rate", { date, currency: code, raw });
      continue;
    }
    rates[code] = inverted;
  }

  return {
    date: payloadDate,
    source: tag === "latest" ? "jsdelivr-latest" : "jsdelivr",
    rates,
  };
}

/**
 * Everything the sources can say about `date`, as rows ready for `fx_rates`.
 * Independent sources run together and fail alone, so an outage at one costs
 * its own currency only; the aggregator runs alongside because BTC has no
 * other source, and doubles as the fallback for any fiat whose official
 * source failed — degraded, but recorded as such in `source`.
 */
export async function fetchRates(
  date: string,
  deps: FxDeps,
): Promise<FetchedRate[]> {
  const [rub, eur, rsd, aggregated] = await Promise.all([
    fetchRubToUsd(date, deps),
    fetchEurToUsdRange(date, deps),
    fetchRsdToUsd(date, deps),
    fetchAggregatorRates(date, deps),
  ]);

  const rows: FetchedRate[] = [];
  // Official rows sit under the requested date, not the source document's:
  // a central bank's list stays in force until the next one, so "the rate on
  // Sunday" genuinely is Friday's number. Filing it under Friday would leave
  // Sunday uncovered, and the negative cache would then retry it forever.
  if (rub !== null) {
    rows.push({ currency: "RUB", effectiveDate: date, rateToUsd: rub, source: "cbr" });
  }
  if (rsd !== null) {
    rows.push({ currency: "RSD", effectiveDate: date, rateToUsd: rsd, source: "nbs" });
  }
  for (const point of eur ?? []) {
    rows.push({ currency: "EUR", ...point, source: "ecb" });
  }

  // Aggregator rows keep the payload's own date (see AggregatorSnapshot.date).
  const fromAggregator: Exclude<CurrencyCode, "USD">[] = ["BTC"];
  if (rub === null) fromAggregator.push("RUB");
  if (eur === null) fromAggregator.push("EUR");
  if (rsd === null) fromAggregator.push("RSD");
  for (const currency of fromAggregator) {
    const rateToUsd = aggregated?.rates[currency];
    if (aggregated && rateToUsd !== undefined) {
      rows.push({
        currency,
        effectiveDate: aggregated.date,
        rateToUsd,
        source: aggregated.source,
      });
    }
  }

  // The pivot is a definition, not a quote, but it rides along with any
  // snapshot so a date that has rates also has the "1" every conversion
  // divides through. Alone it would say nothing, so an all-sources miss
  // writes nothing.
  if (rows.length > 0) {
    rows.push({
      currency: "USD",
      effectiveDate: date,
      rateToUsd: USD_PIVOT_RATE,
      source: "pivot",
    });
  }
  return rows;
}

// Keyed by the transport for the same reason ecbCaches above is: an injected
// fetch (tests, or a future proxy) must never be served a quote some other
// transport downloaded. A bare module-level variable here let a stubbed fetch
// read the value a previous stub had cached, silently exercising the wrong
// branch.
const coinbaseCaches = new WeakMap<
  FxDeps["fetch"],
  { value: string; at: number }
>();

export async function fetchLiveBtcUsd(deps: FxDeps): Promise<string | null> {
  const cached = coinbaseCaches.get(deps.fetch);
  if (cached && Date.now() - cached.at < COINBASE_CACHE_MS) {
    return cached.value;
  }

  const payload = asRecord(await fetchJson(COINBASE_URL, deps));
  const data = payload ? asRecord(payload.data) : null;
  const rates = data ? asRecord(data.rates) : null;
  const raw = rates?.USD;
  // The quote goes straight into a numeric(36,20) column, so `Number()` alone
  // is the wrong gate: it accepts "1e5" (which Postgres would take, silently
  // storing a different literal than the provider sent) and "0x1F" (which
  // Postgres rejects, turning a save into a 500). Only a plain decimal passes,
  // and it is canonicalised through the same scale-20 path the daily rates use
  // — by exact string shifting, never a double.
  if (
    typeof raw !== "string" ||
    !PLAIN_DECIMAL.test(raw) ||
    !isValidRate(Number(raw))
  ) {
    console.warn("fx.invalid_rate", { source: "coinbase", raw });
    return null;
  }

  const value = formatScaledRate(parseRate(raw));
  coinbaseCaches.set(deps.fetch, { value, at: Date.now() });
  return value;
}
