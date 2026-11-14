import { describe, expect, it } from "vitest";
import { buildAccountDays, isListed } from "@/lib/account-days";
import type { CurrencyCode } from "@/lib/currency";
import { parseRate, type RateIndex } from "@/lib/fx/convert";
import type { ExpenseWithConversion } from "@/repositories/expenses";
import type { TopUpWithCurrency } from "@/repositories/top-ups";
import type { AccountTransfer } from "@/repositories/transfers";
import { fixedRateIndex } from "@/test/fx-fixtures";

const SPACE = "00000000-0000-4000-8000-000000000001";
const ACCOUNT = "00000000-0000-4000-8000-000000000002";
const USER = "00000000-0000-4000-8000-000000000003";
const CATEGORY = "00000000-0000-4000-8000-000000000004";

const index = fixedRateIndex();

function expense(
  id: string,
  spentAt: string,
  createdAt: string,
  amountMinor: number,
): ExpenseWithConversion {
  return {
    id,
    spaceId: SPACE,
    createdBy: USER,
    categoryId: CATEGORY,
    accountId: ACCOUNT,
    amountMinor,
    currency: "USD",
    note: id,
    spentAt,
    createdAt: new Date(createdAt),
    convertedMinor: amountMinor,
    displayCurrency: "USD",
  };
}

function topUp(
  id: string,
  occurredOn: string,
  createdAt: string,
  amountMinor: number,
  currency: CurrencyCode = "USD",
): TopUpWithCurrency {
  return {
    id,
    spaceId: SPACE,
    accountId: ACCOUNT,
    createdBy: USER,
    amountMinor,
    note: id,
    occurredOn,
    createdAt: new Date(createdAt),
    currency,
  };
}

function transfer(
  id: string,
  enteredOn: string,
  createdAt: string,
  amountMinor: number,
  currency: CurrencyCode = "USD",
): AccountTransfer {
  return {
    id,
    side: "out",
    amountMinor,
    currency,
    otherAccountName: "Наличные EUR",
    enteredOn,
    createdAt: new Date(createdAt),
  };
}

function ids(days: ReturnType<typeof buildAccountDays>) {
  return days.map((d) => ({
    day: d.day,
    items: d.items.map((i) =>
      i.kind === "expense" ? i.expense.id : i.kind === "topUp" ? i.topUp.id : i.transfer.id,
    ),
  }));
}

// 1 $ = 80 ₽ until 2026-09-10, then 1 $ = 100 ₽.
const twoRates: RateIndex = new Map([
  ["USD", [{ effectiveDate: "2026-09-01", rateToUsd: parseRate("1") }]],
  [
    "RUB",
    [
      { effectiveDate: "2026-09-01", rateToUsd: parseRate("0.0125") },
      { effectiveDate: "2026-09-10", rateToUsd: parseRate("0.01") },
    ],
  ],
]);

describe("buildAccountDays", () => {
  it("groups expenses by date, newest day first", () => {
    const days = buildAccountDays(
      [
        expense("e3", "2026-09-03", "2026-09-03T10:00:00Z", 300),
        expense("e2", "2026-09-02", "2026-09-02T12:00:00Z", 200),
        expense("e1", "2026-09-02", "2026-09-02T09:00:00Z", 100),
      ],
      [],
      [],
      "USD",
      index,
    );
    expect(ids(days)).toEqual([
      { day: "2026-09-03", items: ["e3"] },
      { day: "2026-09-02", items: ["e2", "e1"] },
    ]);
    expect(days.map((d) => d.totalMinor)).toEqual([300, 300]);
  });

  it("interleaves expenses and top-ups of a day by createdAt", () => {
    const days = buildAccountDays(
      [
        expense("e2", "2026-09-02", "2026-09-02T15:00:00Z", 200),
        expense("e1", "2026-09-02", "2026-09-02T09:00:00Z", 100),
      ],
      [
        topUp("t2", "2026-09-02", "2026-09-02T18:00:00Z", 5000),
        topUp("t1", "2026-09-02", "2026-09-02T12:00:00Z", 1000),
      ],
      [],
      "USD",
      index,
    );
    expect(ids(days)).toEqual([{ day: "2026-09-02", items: ["t2", "e2", "t1", "e1"] }]);
  });

  it("a day total ignores top-ups", () => {
    const [day] = buildAccountDays(
      [expense("e1", "2026-09-02", "2026-09-02T09:00:00Z", 250)],
      [topUp("t1", "2026-09-02", "2026-09-02T12:00:00Z", 10000)],
      [],
      "USD",
      index,
    );
    expect(day.totalMinor).toBe(250);
    expect(day.unconverted).toBe(0);
  });

  it("a day with only top-ups has no total", () => {
    const days = buildAccountDays(
      [expense("e1", "2026-09-02", "2026-09-02T09:00:00Z", 250)],
      [topUp("t1", "2026-09-04", "2026-09-04T12:00:00Z", 10000)],
      [],
      "USD",
      index,
    );
    expect(ids(days)).toEqual([
      { day: "2026-09-04", items: ["t1"] },
      { day: "2026-09-02", items: ["e1"] },
    ]);
    expect(days[0].totalMinor).toBeNull();
    expect(days[0].unconverted).toBe(0);
  });

  it("converts a top-up by its own date", () => {
    const days = buildAccountDays(
      [],
      [
        topUp("late", "2026-09-10", "2026-09-10T12:00:00Z", 10000),
        // entered a week after its date: the day and the rate follow the date
        topUp("early", "2026-09-05", "2026-09-12T12:00:00Z", 10000),
      ],
      [],
      "RUB",
      twoRates,
    );
    const converted = days.map((d) =>
      d.items.map((i) => (i.kind === "topUp" ? i.topUp.convertedMinor : null)),
    );
    expect(converted).toEqual([[1000000], [800000]]);
    expect(days[0].items[0]).toMatchObject({
      kind: "topUp",
      topUp: { displayCurrency: "RUB", currency: "USD", amountMinor: 10000 },
    });
  });

  it("a top-up without a rate falls back to the account currency", () => {
    const usdOnly = fixedRateIndex({ USD: "1" });
    const [day] = buildAccountDays(
      [],
      [topUp("t1", "2026-09-02", "2026-09-02T12:00:00Z", 10000, "EUR")],
      [],
      "USD",
      usdOnly,
    );
    expect(day.totalMinor).toBeNull();
    expect(day.unconverted).toBe(0);
    expect(day.items[0]).toMatchObject({
      kind: "topUp",
      topUp: { convertedMinor: null, amountMinor: 10000, currency: "EUR" },
    });
  });

  it("empty input gives no days", () => {
    expect(buildAccountDays([], [], [], "USD", index)).toEqual([]);
  });

  it("a transfer joins the day it was entered and interleaves with expenses and top-ups by createdAt", () => {
    const days = buildAccountDays(
      [
        expense("e2", "2026-09-02", "2026-09-02T15:00:00Z", 200),
        expense("e1", "2026-09-02", "2026-09-02T09:00:00Z", 100),
      ],
      [topUp("t1", "2026-09-02", "2026-09-02T12:00:00Z", 1000)],
      [
        // entered on 2026-09-03 by its author's clock, still 2026-09-02 in UTC
        transfer("x3", "2026-09-03", "2026-09-02T23:30:00Z", 700),
        transfer("x2", "2026-09-02", "2026-09-02T18:00:00Z", 500),
        transfer("x1", "2026-09-02", "2026-09-02T10:00:00Z", 300),
      ],
      "USD",
      index,
    );
    expect(ids(days)).toEqual([
      { day: "2026-09-03", items: ["x3"] },
      { day: "2026-09-02", items: ["x2", "e2", "t1", "x1", "e1"] },
    ]);
  });

  it("a day total ignores transfers", () => {
    const [day] = buildAccountDays(
      [expense("e1", "2026-09-02", "2026-09-02T09:00:00Z", 250)],
      [],
      [
        transfer("x1", "2026-09-02", "2026-09-02T12:00:00Z", 10000),
        { ...transfer("x2", "2026-09-02", "2026-09-02T13:00:00Z", 5000), side: "in" },
      ],
      "USD",
      index,
    );
    expect(day.items).toHaveLength(3);
    expect(day.totalMinor).toBe(250);
    expect(day.unconverted).toBe(0);
  });

  it("a day with only transfers has no total", () => {
    const days = buildAccountDays(
      [expense("e1", "2026-09-02", "2026-09-02T09:00:00Z", 250)],
      [],
      [transfer("x1", "2026-09-04", "2026-09-04T12:00:00Z", 10000)],
      "USD",
      index,
    );
    expect(ids(days)).toEqual([
      { day: "2026-09-04", items: ["x1"] },
      { day: "2026-09-02", items: ["e1"] },
    ]);
    expect(days[0].totalMinor).toBeNull();
    expect(days[0].unconverted).toBe(0);
  });

  it("converts a transfer at the rate of its day of entry", () => {
    const days = buildAccountDays(
      [],
      [],
      [
        // entered on 2026-09-10 by its author's clock, still 2026-09-09 in UTC
        transfer("late", "2026-09-10", "2026-09-09T22:00:00Z", 10000),
        transfer("early", "2026-09-05", "2026-09-05T12:00:00Z", 10000),
      ],
      "RUB",
      twoRates,
    );
    const converted = days.map((d) =>
      d.items.map((i) => (i.kind === "transfer" ? i.transfer.convertedMinor : null)),
    );
    expect(converted).toEqual([[1000000], [800000]]);
    expect(days[0].items[0]).toMatchObject({
      kind: "transfer",
      transfer: { displayCurrency: "RUB", currency: "USD", amountMinor: 10000 },
    });
  });

  it("a transfer without a rate falls back to the account currency", () => {
    const usdOnly = fixedRateIndex({ USD: "1" });
    const [day] = buildAccountDays(
      [],
      [],
      [transfer("x1", "2026-09-02", "2026-09-02T12:00:00Z", 10000, "EUR")],
      "USD",
      usdOnly,
    );
    expect(day.totalMinor).toBeNull();
    expect(day.unconverted).toBe(0);
    expect(day.items[0]).toMatchObject({
      kind: "transfer",
      transfer: { convertedMinor: null, amountMinor: 10000, currency: "EUR" },
    });
  });

  it("an expense item carries exactly the fields its row and card read", () => {
    const [day] = buildAccountDays(
      [expense("e1", "2026-09-02", "2026-09-02T09:00:00Z", 250)],
      [],
      [],
      "USD",
      index,
    );
    expect(day.items[0]).toEqual({
      kind: "expense",
      expense: {
        id: "e1",
        categoryId: CATEGORY,
        accountId: ACCOUNT,
        amountMinor: 250,
        currency: "USD",
        note: "e1",
        spentAt: "2026-09-02",
        convertedMinor: 250,
        displayCurrency: "USD",
      },
    });
  });

  it("a top-up item carries exactly id, amountMinor, currency, note, occurredOn, convertedMinor, displayCurrency", () => {
    const [day] = buildAccountDays(
      [],
      [topUp("t1", "2026-09-02", "2026-09-02T12:00:00Z", 10000)],
      [],
      "USD",
      index,
    );
    expect(day.items[0]).toEqual({
      kind: "topUp",
      topUp: {
        id: "t1",
        amountMinor: 10000,
        currency: "USD",
        note: "t1",
        occurredOn: "2026-09-02",
        convertedMinor: 10000,
        displayCurrency: "USD",
      },
    });
  });

  it("a transfer item carries exactly id, side, amountMinor, currency, otherAccountName, convertedMinor, displayCurrency", () => {
    const [day] = buildAccountDays(
      [],
      [],
      [transfer("x1", "2026-09-02", "2026-09-02T12:00:00Z", 10000)],
      "USD",
      index,
    );
    expect(day.items[0]).toEqual({
      kind: "transfer",
      transfer: {
        id: "x1",
        side: "out",
        amountMinor: 10000,
        currency: "USD",
        otherAccountName: "Наличные EUR",
        convertedMinor: 10000,
        displayCurrency: "USD",
      },
    });
  });
});

describe("isListed", () => {
  const days = buildAccountDays(
    [expense("e1", "2026-09-02", "2026-09-02T09:00:00Z", 100)],
    [topUp("t1", "2026-09-01", "2026-09-01T09:00:00Z", 500)],
    [transfer("x1", "2026-09-01", "2026-09-01T10:00:00Z", 300)],
    "USD",
    index,
  );

  it("finds an entry of its kind among the rows", () => {
    expect(isListed(days, "expense", "e1")).toBe(true);
    expect(isListed(days, "topUp", "t1")).toBe(true);
  });

  it("does not find a gone entry or the id of an entry of the other kind", () => {
    expect(isListed(days, "expense", "e2")).toBe(false);
    expect(isListed(days, "topUp", "e1")).toBe(false);
    expect(isListed(days, "expense", "t1")).toBe(false);
  });

  it("finds a transfer by its kind and not by another kind's id", () => {
    expect(isListed(days, "transfer", "x1")).toBe(true);
    expect(isListed(days, "expense", "x1")).toBe(false);
    expect(isListed(days, "topUp", "x1")).toBe(false);
    expect(isListed(days, "transfer", "e1")).toBe(false);
    expect(isListed(days, "transfer", "t1")).toBe(false);
  });
});
