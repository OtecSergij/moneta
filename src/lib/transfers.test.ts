import { describe, expect, it } from "vitest";
import type { CurrencyCode } from "@/lib/currency";
import { snapshotIndex } from "@/lib/fx/convert";
import {
  EMPTY_TRANSFER_DRAFT,
  TransferAmountPatch,
  TransferInput,
  crossCurrency,
  pickTarget,
  transferAmountPatch,
  transferCardSchema,
  transferFormErrors,
  transferFormValues,
  transferInput,
  transferLabels,
  transferTargets,
  typeCredit,
  type TransferDraft,
} from "@/lib/transfers";

const base = {
  fromAccountId: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
  toAccountId: "0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d",
  fromAmountMinor: 1000,
  toAmountMinor: 11,
};

describe("TransferInput", () => {
  it("TransferInput rejects zero and negative amounts on both sides", () => {
    expect(TransferInput.safeParse(base).success).toBe(true);
    for (const amount of [0, -100]) {
      expect(TransferInput.safeParse({ ...base, fromAmountMinor: amount }).success).toBe(false);
      expect(TransferInput.safeParse({ ...base, toAmountMinor: amount }).success).toBe(false);
    }
  });

  it("TransferInput rejects the same account on both places", () => {
    expect(
      TransferInput.safeParse({ ...base, toAccountId: base.fromAccountId }).success,
    ).toBe(false);
  });

  it("TransferInput rejects a fractional amount and an id that is not a uuid", () => {
    expect(TransferInput.safeParse({ ...base, fromAmountMinor: 10.5 }).success).toBe(false);
    expect(TransferInput.safeParse({ ...base, toAmountMinor: 10.5 }).success).toBe(false);
    expect(TransferInput.safeParse({ ...base, fromAccountId: "1" }).success).toBe(false);
    expect(TransferInput.safeParse({ ...base, toAccountId: "1" }).success).toBe(false);
  });

  it("TransferInput accepts a missing credit amount", () => {
    expect(TransferInput.safeParse({ ...base, toAmountMinor: undefined }).success).toBe(true);
    const { fromAccountId, toAccountId, fromAmountMinor } = base;
    expect(TransferInput.parse({ fromAccountId, toAccountId, fromAmountMinor })).toEqual({
      fromAccountId,
      toAccountId,
      fromAmountMinor,
    });
  });
});

describe("TransferAmountPatch", () => {
  it("TransferAmountPatch rejects zero, a negative and an empty patch", () => {
    expect(TransferAmountPatch.parse({ amountMinor: 500 })).toEqual({ amountMinor: 500 });
    expect(TransferAmountPatch.safeParse({ amountMinor: 0 }).success).toBe(false);
    expect(TransferAmountPatch.safeParse({ amountMinor: -500 }).success).toBe(false);
    expect(TransferAmountPatch.safeParse({}).success).toBe(false);
  });
});

describe("transferLabels", () => {
  it("transferLabels: out names the target, in names the source, a gone account gives no subtitle and the plain title", () => {
    expect(transferLabels("out", "Наличные EUR")).toEqual({
      subtitle: "на счёт Наличные EUR",
      cardTitle: "Перевод на счёт Наличные EUR",
    });
    expect(transferLabels("in", "Наличные RSD")).toEqual({
      subtitle: "со счёта Наличные RSD",
      cardTitle: "Перевод со счёта Наличные RSD",
    });
    for (const side of ["out", "in"] as const) {
      expect(transferLabels(side, null)).toEqual({ subtitle: null, cardTitle: "Перевод" });
    }
  });
});

describe("transferCardSchema", () => {
  it("transferCardSchema rejects zero and an empty amount", () => {
    expect(transferCardSchema.safeParse({ amount: "100", currency: "USD" }).success).toBe(true);
    for (const amount of ["0", ""]) {
      expect(transferCardSchema.safeParse({ amount, currency: "USD" }).error?.issues).toEqual([
        expect.objectContaining({ path: ["amount"], message: "Введите сумму больше нуля" }),
      ]);
    }
  });
});

describe("transferAmountPatch", () => {
  it("transferAmountPatch is null for an unchanged amount, also for an equal amount typed differently", () => {
    expect(transferAmountPatch({ amount: "100", currency: "USD" }, 10000)).toBeNull();
    expect(transferAmountPatch({ amount: "100,00", currency: "USD" }, 10000)).toBeNull();
  });

  it("transferAmountPatch is null for an untouched prefill with group spaces", () => {
    expect(transferAmountPatch({ amount: "1 234,50", currency: "USD" }, 123450)).toBeNull();
    expect(transferAmountPatch({ amount: "16 200", currency: "RSD" }, 1620000)).toBeNull();
  });

  it("transferAmountPatch carries the new amount", () => {
    expect(transferAmountPatch({ amount: "150,5", currency: "USD" }, 10000)).toEqual({
      amountMinor: 15050,
    });
    expect(transferAmountPatch({ amount: "16 200", currency: "RSD" }, 1500000)).toEqual({
      amountMinor: 1620000,
    });
  });
});

const TODAY = "2026-11-13";
const index = snapshotIndex(
  {
    USD: "1",
    EUR: "1.08695652173913043478",
    RSD: "0.00925925925925925926",
    RUB: "0.01242236024844720497",
  },
  TODAY,
);

const account = (id: string, name: string, currency: CurrencyCode) => ({ id, name, currency });
const CARD_USD = account("6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b", "Карта USD", "USD");
const CASH_EUR = account("0a9b8c7d-6e5f-4a3b-8c1d-2e3f4a5b6c7d", "Наличные EUR", "EUR");
const CASH_RSD = account("1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7a8b", "Наличные RSD", "RSD");
const CASH_USD = account("2c3d4e5f-6071-4829-8b3c-4d5e6f7a8b9c", "Наличные USD", "USD");
const CASH_RUB = account("3d4e5f60-7182-4930-9c4d-5e6f7a8b9c0d", "Наличные RUB", "RUB");
const WALLET_BTC = account("4e5f6071-8293-4a41-8d5e-6f7a8b9c0d1e", "Кошелёк BTC", "BTC");
const TARGETS = [CASH_EUR, CASH_RSD, CASH_USD, CASH_RUB, WALLET_BTC];

const formValues = (draft: TransferDraft, currency: CurrencyCode = "USD") =>
  transferFormValues(draft, currency, TARGETS, index, TODAY);
const debit = (amount: string) => ({ ...EMPTY_TRANSFER_DRAFT, amount });
const credit = (draft: TransferDraft, currency: CurrencyCode = "USD") =>
  formValues(draft, currency).credit;
const formErrors = (draft: TransferDraft) => transferFormErrors(formValues(draft), draft);

describe("transferTargets", () => {
  it("transferTargets lists the other accounts in their order and is empty for a single account", () => {
    expect(transferTargets([CARD_USD, CASH_EUR, CASH_RSD], CARD_USD.id)).toEqual([
      CASH_EUR,
      CASH_RSD,
    ]);
    expect(transferTargets([CASH_RSD, CARD_USD, CASH_EUR], CARD_USD.id)).toEqual([
      CASH_RSD,
      CASH_EUR,
    ]);
    expect(transferTargets([CARD_USD], CARD_USD.id)).toEqual([]);
  });
});

describe("transferFormValues", () => {
  it("the credit is the debit converted at the day's rates, printed the way amount fields are prefilled", () => {
    expect(formValues(pickTarget(debit("100"), CASH_EUR.id))).toEqual({
      toAccountId: CASH_EUR.id,
      amount: "100",
      currency: "USD",
      credit: "92",
      creditCurrency: "EUR",
    });
    expect(credit(pickTarget(debit("100"), CASH_RSD.id))).toBe("10 800");
    expect(credit(pickTarget(debit("100,50"), CASH_RUB.id))).toBe("8 090,25");
  });

  it("an untouched credit follows every change of the debit; a typed credit stays when the debit changes, also when it was cleared by hand", () => {
    let draft = pickTarget(EMPTY_TRANSFER_DRAFT, CASH_EUR.id);
    draft = { ...draft, amount: "100" };
    expect(credit(draft)).toBe("92");
    draft = { ...draft, amount: "50" };
    expect(credit(draft)).toBe("46");

    draft = typeCredit(draft, "45");
    expect(credit(draft)).toBe("45");
    draft = { ...draft, amount: "200" };
    expect(credit(draft)).toBe("45");

    draft = typeCredit(draft, "");
    expect(credit(draft)).toBe("");
    draft = { ...draft, amount: "300" };
    expect(credit(draft)).toBe("");
  });

  it("picking an account recalculates the credit for its currency, also after a typed credit", () => {
    let draft = pickTarget(debit("100"), CASH_EUR.id);
    draft = typeCredit(draft, "90");
    expect(credit(draft)).toBe("90");

    draft = pickTarget(draft, CASH_RSD.id);
    expect(formValues(draft)).toMatchObject({ credit: "10 800", creditCurrency: "RSD" });

    draft = typeCredit(draft, "");
    draft = pickTarget(draft, CASH_EUR.id);
    expect(formValues(draft)).toMatchObject({ credit: "92", creditCurrency: "EUR" });
  });

  it("tapping the chosen account again keeps a typed credit", () => {
    const draft = typeCredit(pickTarget(debit("100"), CASH_EUR.id), "90");
    expect(credit(pickTarget(draft, CASH_EUR.id))).toBe("90");
  });

  it("the credit is empty for an empty, zero or unparsable debit, for a currency without a rate and for a result that rounds to zero", () => {
    for (const amount of ["", "0", "0,00", "abc", "-5", "1,234"]) {
      expect(credit(pickTarget(debit(amount), CASH_EUR.id)), amount).toBe("");
    }
    expect(formValues(pickTarget(debit("100"), WALLET_BTC.id))).toMatchObject({
      credit: "",
      creditCurrency: "BTC",
    });
    expect(credit(pickTarget(debit("0,01"), CASH_RSD.id), "RUB")).toBe("");
    expect(credit(pickTarget(debit("1"), CASH_RSD.id), "RUB")).toBe("1");
  });

  it("a same-currency target has no credit and sends none, also when picked after a different-currency one", () => {
    let draft = pickTarget(debit("100"), CASH_EUR.id);
    draft = typeCredit(draft, "90");
    draft = pickTarget(draft, CASH_USD.id);
    const values = formValues(draft);
    expect(values).toEqual({
      toAccountId: CASH_USD.id,
      amount: "100",
      currency: "USD",
      credit: "",
      creditCurrency: "USD",
    });
    expect(crossCurrency(values)).toBeNull();
    expect(transferFormErrors(values, draft)).toEqual({});
    expect(transferInput(values, CARD_USD.id)).not.toHaveProperty("toAmountMinor");
  });

  it("a chosen account that is no longer among the targets counts as not chosen", () => {
    const draft = pickTarget(debit("100"), CASH_EUR.id);
    const values = transferFormValues(draft, "USD", [CASH_RSD, CASH_USD], index, TODAY);
    expect(values).toEqual({
      toAccountId: "",
      amount: "100",
      currency: "USD",
      credit: "",
      creditCurrency: null,
    });
    expect(transferFormErrors(values, draft)).toEqual({ toAccountId: "Выберите счёт" });
  });
});

describe("transferFormErrors", () => {
  const POSITIVE = "Введите сумму больше нуля";

  it("the form errors require a target, a positive debit, and a positive credit only across currencies", () => {
    expect(formErrors(EMPTY_TRANSFER_DRAFT)).toEqual({
      toAccountId: "Выберите счёт",
      amount: POSITIVE,
    });
    expect(formErrors(debit("100"))).toEqual({ toAccountId: "Выберите счёт" });

    expect(formErrors(pickTarget(debit("100"), CASH_USD.id))).toEqual({});
    expect(formErrors(pickTarget(debit("0"), CASH_USD.id))).toEqual({ amount: POSITIVE });

    const acrossDraft = pickTarget(debit("100"), CASH_EUR.id);
    expect(formErrors(acrossDraft)).toEqual({});
    for (const text of ["", "0", "abc"]) {
      expect(formErrors(typeCredit(acrossDraft, text)), text).toEqual({ credit: POSITIVE });
    }
    expect(formErrors(pickTarget(debit("100"), WALLET_BTC.id))).toEqual({ credit: POSITIVE });
  });

  it("the credit error waits while the debit has its own error and the credit follows the rate", () => {
    for (const amount of ["", "0", "abc"]) {
      expect(formErrors(pickTarget(debit(amount), CASH_EUR.id)), amount).toEqual({
        amount: POSITIVE,
      });
    }
    const noRate = pickTarget(debit(""), WALLET_BTC.id);
    expect(formErrors(noRate)).toEqual({ amount: POSITIVE });
    expect(formErrors({ ...noRate, amount: "100" })).toEqual({ credit: POSITIVE });
  });

  it("a typed credit shows its own error even when the debit has one", () => {
    for (const text of ["", "0", "abc"]) {
      expect(formErrors(typeCredit(pickTarget(debit(""), CASH_EUR.id), text)), text).toEqual({
        amount: POSITIVE,
        credit: POSITIVE,
      });
    }
    expect(formErrors(typeCredit(pickTarget(debit("0"), CASH_EUR.id), "90"))).toEqual({
      amount: POSITIVE,
    });
  });
});

describe("transferInput", () => {
  it("transferInput takes the page account as the source", () => {
    const input = transferInput(formValues(pickTarget(debit("100"), CASH_USD.id)), CARD_USD.id);
    expect(input).toEqual({
      fromAccountId: CARD_USD.id,
      toAccountId: CASH_USD.id,
      fromAmountMinor: 10000,
    });
    expect(TransferInput.safeParse(input).success).toBe(true);
  });

  it("transferInput sends what stands in the credit field: the converted amount when untouched, the typed amount after an edit", () => {
    const untouched = pickTarget(debit("100"), CASH_EUR.id);
    expect(transferInput(formValues(untouched), CARD_USD.id)).toEqual({
      fromAccountId: CARD_USD.id,
      toAccountId: CASH_EUR.id,
      fromAmountMinor: 10000,
      toAmountMinor: 9200,
    });
    expect(transferInput(formValues(typeCredit(untouched, "91,5")), CARD_USD.id)).toMatchObject({
      toAmountMinor: 9150,
    });
    const rsd = typeCredit(pickTarget(debit("100"), CASH_RSD.id), "10 900");
    expect(transferInput(formValues(rsd), CARD_USD.id)).toMatchObject({
      toAmountMinor: 1090000,
    });
  });

  it("transferInput sends the credit only across currencies", () => {
    const across = transferInput(formValues(pickTarget(debit("100"), CASH_RSD.id)), CARD_USD.id);
    expect(across).toMatchObject({ toAmountMinor: 1080000 });
    expect(TransferInput.safeParse(across).success).toBe(true);

    const typedThenSame: TransferDraft = { toAccountId: CASH_USD.id, amount: "100", credit: "90" };
    expect(transferInput(formValues(typedThenSame), CARD_USD.id)).not.toHaveProperty(
      "toAmountMinor",
    );
  });
});
