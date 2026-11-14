import { z } from "zod";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import { refinePositiveAmount, requirePositiveAmount } from "@/lib/entry-form";
import { convertRow, type RateIndex } from "@/lib/fx/convert";
import { minorToInput, parseMoney } from "@/lib/money";
import type { AccountTransfer } from "@/repositories/transfers";

const PositiveMinor = z.int().positive();
const AccountId = z.uuid().transform((id) => id.toLowerCase());

export const TransferInput = z
  .object({
    fromAccountId: AccountId,
    toAccountId: AccountId,
    fromAmountMinor: PositiveMinor,
    toAmountMinor: PositiveMinor.optional(),
  })
  .refine((t) => t.fromAccountId !== t.toAccountId, { path: ["toAccountId"] });
export type TransferInput = z.infer<typeof TransferInput>;

export const TransferAmountPatch = z.object({ amountMinor: PositiveMinor });
export type TransferAmountPatch = z.infer<typeof TransferAmountPatch>;

export function transferLabels(
  side: AccountTransfer["side"],
  otherAccountName: string | null,
): { subtitle: string | null; cardTitle: string } {
  if (otherAccountName === null) return { subtitle: null, cardTitle: "Перевод" };
  const subtitle =
    side === "out" ? `на счёт ${otherAccountName}` : `со счёта ${otherAccountName}`;
  return { subtitle, cardTitle: `Перевод ${subtitle}` };
}

export const transferCardSchema = z
  .object({ amount: z.string(), currency: z.enum(CURRENCY_CODES) })
  .superRefine(refinePositiveAmount);
export type TransferCardValues = z.infer<typeof transferCardSchema>;

// null when the amount did not change.
export function transferAmountPatch(
  values: TransferCardValues,
  amountMinor: number,
): TransferAmountPatch | null {
  const next = parseMoney(values.amount, values.currency)!;
  return next === amountMinor ? null : { amountMinor: next };
}

export function transferTargets<T extends { id: string }>(accounts: T[], accountId: string): T[] {
  return accounts.filter((a) => a.id !== accountId);
}

// credit: null while the field follows the rate, the typed text after a hand edit.
export type TransferDraft = { toAccountId: string; amount: string; credit: string | null };

export const EMPTY_TRANSFER_DRAFT: TransferDraft = { toAccountId: "", amount: "", credit: null };

export function pickTarget(draft: TransferDraft, toAccountId: string): TransferDraft {
  if (toAccountId === draft.toAccountId) return draft;
  return { ...draft, toAccountId, credit: null };
}

export function typeCredit(draft: TransferDraft, text: string): TransferDraft {
  return { ...draft, credit: text };
}

const transferFormSchema = z
  .object({
    toAccountId: z.uuid("Выберите счёт"),
    amount: z.string(),
    currency: z.enum(CURRENCY_CODES),
    credit: z.string(),
    creditCurrency: z.enum(CURRENCY_CODES).nullable(),
  })
  .superRefine((values, ctx) => {
    requirePositiveAmount(values.amount, values.currency, ["amount"], ctx);
    const across = crossCurrency(values);
    if (across) requirePositiveAmount(values.credit, across, ["credit"], ctx);
  });
type TransferFormValues = z.infer<typeof transferFormSchema>;

export function crossCurrency(values: TransferFormValues): CurrencyCode | null {
  return values.creditCurrency === values.currency ? null : values.creditCurrency;
}

function convertedCredit(
  amount: string,
  currency: CurrencyCode,
  creditCurrency: CurrencyCode,
  index: RateIndex,
  today: string,
): string {
  const amountMinor = parseMoney(amount, currency);
  if (amountMinor === null) return "";
  const converted = convertRow({ amountMinor, currency, spentAt: today }, creditCurrency, index);
  return converted === null || converted === 0 ? "" : minorToInput(converted, creditCurrency);
}

export function transferFormValues(
  draft: TransferDraft,
  currency: CurrencyCode,
  targets: { id: string; currency: CurrencyCode }[],
  index: RateIndex,
  today: string,
): TransferFormValues {
  const target = targets.find((a) => a.id === draft.toAccountId);
  const values = { toAccountId: "", amount: draft.amount, currency, credit: "", creditCurrency: null };
  if (!target) return values;
  if (target.currency === currency) {
    return { ...values, toAccountId: target.id, creditCurrency: currency };
  }
  return {
    ...values,
    toAccountId: target.id,
    credit:
      draft.credit ?? convertedCredit(draft.amount, currency, target.currency, index, today),
    creditCurrency: target.currency,
  };
}

type TransferFormErrors = Partial<Record<"toAccountId" | "amount" | "credit", string>>;

export function transferFormErrors(
  values: TransferFormValues,
  draft: TransferDraft,
): TransferFormErrors {
  const errors: TransferFormErrors = {};
  for (const issue of transferFormSchema.safeParse(values).error?.issues ?? []) {
    const path = issue.path[0] as keyof TransferFormErrors;
    errors[path] ??= issue.message;
  }
  if (errors.amount && draft.credit === null) delete errors.credit;
  return errors;
}

// Takes values transferFormErrors found no errors in.
export function transferInput(values: TransferFormValues, accountId: string): TransferInput {
  const input: TransferInput = {
    fromAccountId: accountId,
    toAccountId: values.toAccountId,
    fromAmountMinor: parseMoney(values.amount, values.currency)!,
  };
  const across = crossCurrency(values);
  if (across) input.toAmountMinor = parseMoney(values.credit, across)!;
  return input;
}
