import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";
import { FUTURE_DATE_ERROR, toISODate, todayISO } from "@/lib/dates";
import {
  TOP_UP_NOTE_MAX,
  TopUpInput,
  TopUpPatch,
  topUpFormSchema,
  topUpNoteToInput,
  topUpPatch,
} from "@/lib/top-ups";

const base = {
  accountId: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
  amountMinor: 1000,
  note: "Зарплата",
  occurredOn: "2026-01-15",
};

describe("TopUpInput", () => {
  it("TopUpInput rejects zero and negative amounts", () => {
    expect(TopUpInput.safeParse(base).success).toBe(true);
    expect(TopUpInput.safeParse({ ...base, amountMinor: 0 }).success).toBe(false);
    expect(TopUpInput.safeParse({ ...base, amountMinor: -100 }).success).toBe(false);
  });

  it("turns a blank note into «Пополнение»", () => {
    expect(TopUpInput.parse({ ...base, note: "   " }).note).toBe("Пополнение");
    expect(TopUpInput.parse({ ...base, note: "" }).note).toBe("Пополнение");
    expect(TopUpInput.parse({ ...base, note: "  Премия " }).note).toBe("Премия");
    expect(TopUpInput.safeParse({ ...base, note: null }).success).toBe(false);
  });

  it("rejects a note over 200 characters", () => {
    expect(TOP_UP_NOTE_MAX).toBe(200);
    expect(TopUpInput.safeParse({ ...base, note: "а".repeat(200) }).success).toBe(true);
    expect(TopUpInput.safeParse({ ...base, note: "а".repeat(201) }).success).toBe(false);
  });
});

describe("TopUpPatch", () => {
  it("TopUpPatch has no accountId", () => {
    expect(TopUpPatch.parse({ amountMinor: 500, accountId: base.accountId })).toEqual({
      amountMinor: 500,
    });
  });

  it("a patch that clears the note sets «Пополнение»", () => {
    expect(TopUpPatch.parse({ note: " " })).toEqual({ note: "Пополнение" });
    expect(TopUpPatch.parse({ note: "" })).toEqual({ note: "Пополнение" });
  });

  it("TopUpPatch rejects an empty patch and one with only accountId", () => {
    expect(TopUpPatch.safeParse({}).success).toBe(false);
    expect(TopUpPatch.safeParse({ accountId: base.accountId }).success).toBe(false);
  });
});

describe("topUpFormSchema", () => {
  it("the form schema rejects a future date and a zero amount", () => {
    const values = { amount: "500", currency: "USD", note: "", occurredOn: todayISO() };
    expect(topUpFormSchema.safeParse(values).success).toBe(true);

    const zero = topUpFormSchema.safeParse({ ...values, amount: "0" });
    expect(zero.error?.issues).toEqual([
      expect.objectContaining({ path: ["amount"], message: "Введите сумму больше нуля" }),
    ]);

    const tomorrow = toISODate(addDays(new Date(), 1));
    const future = topUpFormSchema.safeParse({ ...values, occurredOn: tomorrow });
    expect(future.error?.issues).toEqual([
      expect.objectContaining({ path: ["occurredOn"], message: FUTURE_DATE_ERROR }),
    ]);
  });
});

describe("topUpNoteToInput", () => {
  it("opens «Пополнение» as an empty field and any other note as it is", () => {
    expect(topUpNoteToInput("Пополнение")).toBe("");
    expect(topUpNoteToInput("Зарплата")).toBe("Зарплата");
    expect(topUpNoteToInput("пополнение")).toBe("пополнение");
    expect(topUpNoteToInput("Пополнение карты")).toBe("Пополнение карты");
  });
});

describe("topUpPatch", () => {
  const values = { amount: "1 234,50", currency: "RUB", note: " Зарплата ", occurredOn: "2026-01-15" } as const;
  const saved = { amountMinor: 123450, note: "Зарплата", occurredOn: "2026-01-15" };

  it("sends every field for a new top-up, a blank description as «Пополнение»", () => {
    expect(topUpPatch(values, null)).toEqual(saved);
    expect(topUpPatch({ ...values, note: "  " }, null)).toEqual({ ...saved, note: "Пополнение" });
  });

  it("is empty when nothing changed", () => {
    expect(topUpPatch(values, saved)).toEqual({});
  });

  it("is empty for a top-up saved without a description, untouched or cleared", () => {
    const untitled = { ...saved, note: "Пополнение" };
    expect(topUpPatch({ ...values, note: "Пополнение" }, untitled)).toEqual({});
    expect(topUpPatch({ ...values, note: " " }, untitled)).toEqual({});
  });

  it("is empty for an untouched card opened with «Пополнение»", () => {
    const untitled = { ...saved, note: "Пополнение" };
    expect(topUpPatch({ ...values, note: topUpNoteToInput(untitled.note) }, untitled)).toEqual({});
  });

  it("holds only the changed fields", () => {
    expect(topUpPatch({ ...values, amount: "100" }, saved)).toEqual({ amountMinor: 10000 });
    expect(topUpPatch({ ...values, note: "" }, saved)).toEqual({ note: "Пополнение" });
    expect(topUpPatch({ ...values, occurredOn: "2026-01-14" }, saved)).toEqual({
      occurredOn: "2026-01-14",
    });
  });
});
