import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import { setDisplayCurrency } from "@/repositories/user-settings";
import { clearRates, mkRate, mkUser } from "@/test/factories";

// The action reads fx_rates and never fetches; the session gate is what the
// tests drive. @/lib/dal is replaced wholesale rather than stubbed through:
// the real module is `server-only` and reaches for `headers()`, which has no
// request context here.
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/lib/dal", () => ({
  requireSession: async () => {
    // What redirect("/login") does inside a real request: it throws, so the
    // action body never runs. A signed-out call fails by that rejection —
    // the action has no catch of its own and must not grow one, or a signed-out
    // caller would get a normal-looking answer.
    if (session.userId === null) throw new Error("NEXT_REDIRECT;/login");
    return { user: { id: session.userId } };
  },
}));

import { quoteConversionAction } from "@/lib/actions/fx";

beforeEach(clearRates);

const PLAIN_DATE = "2026-04-10";

const RATES: Record<CurrencyCode, string> = {
  RUB: "0.01040000000000000000",
  USD: "1.00000000000000000000",
  EUR: "1.09000000000000000000",
  RSD: "0.00930000000000000000",
  BTC: "65000.00000000000000000000",
};

async function seedRates(effectiveDate: string): Promise<void> {
  for (const currency of CURRENCY_CODES) {
    await mkRate({ currency, effectiveDate, rateToUsd: RATES[currency] });
  }
}

// Counts every outbound request the action makes; it must stay at zero, rates
// on file or not.
async function withCountedFetch<T>(
  run: (fetch: ReturnType<typeof vi.fn>) => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  const spy = vi.fn(async () => new Response("{}", { status: 200 }));
  globalThis.fetch = spy as unknown as typeof globalThis.fetch;
  try {
    return await run(spy);
  } finally {
    globalThis.fetch = original;
  }
}

describe("quoteConversionAction — session gate", () => {
  it("rejects without a session and reaches no external API", async () => {
    session.userId = null;

    await withCountedFetch(async (fetch) => {
      await expect(
        quoteConversionAction({
          amountMinor: 100000,
          currency: "BTC",
          spentAt: PLAIN_DATE,
        }),
      ).rejects.toThrow(/NEXT_REDIRECT/);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});

describe("quoteConversionAction — plain conversion", () => {
  it("converts into the display currency held behind the session, not one from the client", async () => {
    const u = await mkUser();
    await setDisplayCurrency(u.id, "USD");
    session.userId = u.id;
    await seedRates(PLAIN_DATE);

    const res = await withCountedFetch(async (fetch) => {
      const result = await quoteConversionAction({
        amountMinor: 10000, // 100,00 ₽
        currency: "RUB",
        spentAt: PLAIN_DATE,
      });
      expect(fetch).not.toHaveBeenCalled();
      return result;
    });

    if (!res.ok) throw new Error(res.error);
    expect(res.data.displayCurrency).toBe("USD");
    expect(res.data.convertedMinor).toBe(104); // 100 ₽ * 0,0104 = $1,04
  });
});

describe("quoteConversionAction — no rate on file", () => {
  it("answers without a conversion and fetches nothing", async () => {
    const u = await mkUser();
    await setDisplayCurrency(u.id, "USD");
    session.userId = u.id;

    const res = await withCountedFetch(async (fetch) => {
      const result = await quoteConversionAction({
        amountMinor: 10000,
        currency: "RUB",
        spentAt: PLAIN_DATE,
      });
      expect(fetch).not.toHaveBeenCalled();
      return result;
    });

    expect(res).toEqual({ ok: true, data: { convertedMinor: null, displayCurrency: "USD" } });
  });
});
