import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import { type ConvertibleRow, convertRow } from "@/lib/fx/convert";
import {
  deriveOverrideForFixation,
  loadRateIndex,
} from "@/repositories/fx-rates";
import { setDisplayCurrency } from "@/repositories/user-settings";
import { clearRates, mkRate, mkUser } from "@/test/factories";

// The session is the only thing standing between this action and two outbound
// APIs, so it is what the tests drive. @/lib/dal is replaced wholesale rather
// than stubbed through: the real module is `server-only` and reaches for
// `headers()`, which has no request context here.
const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/lib/dal", () => ({
  requireSession: async () => {
    // What redirect("/login") does inside a real request: it throws, so the
    // action body never runs. AC-28's "returns an error" is that rejection —
    // the action has no catch of its own and must not grow one, or a signed-out
    // caller would get a normal-looking answer.
    if (session.userId === null) throw new Error("NEXT_REDIRECT;/login");
    return { user: { id: session.userId } };
  },
}));

import { quoteConversionAction } from "@/lib/actions/fx";

beforeEach(clearRates);

const PLAIN_DATE = "2026-04-10";
const FIXATION_DATE = "2026-04-11";

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

// Counts every outbound request the action could make. All five rates are on
// file before each quote, so ensureRates short-circuits and this must stay at
// zero — the action's `defaultDeps` reads globalThis.fetch per call, so the
// stub is actually reachable.
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

describe("quoteConversionAction — session gate (AC-28)", () => {
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

describe("quoteConversionAction — fixation with a third display currency", () => {
  it("prices the fixation exactly as the saved row will render", async () => {
    const u = await mkUser();
    await setDisplayCurrency(u.id, "EUR");
    session.userId = u.id;
    await seedRates(FIXATION_DATE);

    // 3 000 RSD entered, 2 850 ₽ actually debited, shown in EUR — none of the
    // three currencies coincide, so convert.ts's identity rules don't apply and
    // only the derived override can make the preview agree with the save.
    const fixation = {
      amountMinor: 300000,
      currency: "RSD" as const,
      chargedAmountMinor: 285000,
      chargedCurrency: "RUB" as const,
      spentAt: FIXATION_DATE,
    };

    const res = await quoteConversionAction(fixation);
    if (!res.ok) throw new Error(res.error);
    expect(res.data.displayCurrency).toBe("EUR");

    const derived = await deriveOverrideForFixation(fixation);
    expect(derived).not.toBeNull();
    const index = await loadRateIndex([...CURRENCY_CODES], FIXATION_DATE);
    const saved: ConvertibleRow = {
      amountMinor: fixation.amountMinor,
      currency: fixation.currency,
      spentAt: fixation.spentAt,
      rateToUsdOverride: derived!.rateToUsdOverride,
      chargedAmountMinor: fixation.chargedAmountMinor,
      chargedCurrency: fixation.chargedCurrency,
    };
    expect(res.data.convertedMinor).toBe(convertRow(saved, "EUR", index));

    // And it is not the reference conversion the preview used to show — that
    // difference is the card-vs-reference margin the fixation exists to record.
    const reference: ConvertibleRow = {
      ...saved,
      rateToUsdOverride: null,
      chargedAmountMinor: null,
      chargedCurrency: null,
    };
    expect(convertRow(reference, "EUR", index)).not.toBe(
      res.data.convertedMinor,
    );
  });
});
