import { z } from "zod";
import { currencyMeta, type CurrencyCode } from "@/lib/currency";
import { parseMoney } from "@/lib/money";
import { FUTURE_DATE_ERROR, isFutureISO } from "@/lib/dates";

export const entryDateField = z.iso
  .date("Укажите дату")
  .refine((d) => !isFutureISO(d), FUTURE_DATE_ERROR);

export function fractionDigitsError(
  amount: string,
  currency: CurrencyCode,
): string | undefined {
  const { exponent } = currencyMeta(currency);
  const fraction = /^\d+[.,](\d+)$/.exec(amount.replace(/\s/g, ""))?.[1];
  if (fraction === undefined || fraction.length <= exponent) return undefined;
  return `Не больше ${exponent} знаков после запятой`;
}

export function requirePositiveAmount(
  amount: string,
  currency: CurrencyCode,
  path: PropertyKey[],
  ctx: z.RefinementCtx,
) {
  const minor = parseMoney(amount, currency);
  if (minor === null || minor <= 0) {
    ctx.addIssue({
      code: "custom",
      message: fractionDigitsError(amount, currency) ?? "Введите сумму больше нуля",
      path,
    });
  }
}

export function refinePositiveAmount(
  values: { amount: string; currency: CurrencyCode },
  ctx: z.RefinementCtx,
) {
  requirePositiveAmount(values.amount, values.currency, ["amount"], ctx);
}
