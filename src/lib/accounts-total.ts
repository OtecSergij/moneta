import type { CurrencyCode } from "@/lib/currency";
import { type RateIndex, convertRow, sumConverted } from "@/lib/fx/convert";

export type AccountBalance = {
  id: string;
  name: string;
  currency: CurrencyCode;
  balanceMinor: number;
  expenseCount: number;
};

export type AccountSummaryRow = AccountBalance & {
  convertedMinor: number | null;
  sharePermille: number;
  toneIndex: number;
};

export type AccountsSummary = {
  totalMinor: number;
  unconverted: number;
  rows: AccountSummaryRow[];
};

export function summarizeAccounts(
  accounts: AccountBalance[],
  display: CurrencyCode,
  index: RateIndex,
  today: string,
): AccountsSummary {
  const convertible = accounts.map((a) => ({
    amountMinor: a.balanceMinor,
    currency: a.currency,
    spentAt: today,
  }));
  const { totalMinor, unconverted } = sumConverted(convertible, display, index);

  const converted = accounts.map((a, i) => ({
    ...a,
    convertedMinor: convertRow(convertible[i], display, index),
  }));
  converted.sort((x, y) => {
    if (x.convertedMinor === null || y.convertedMinor === null) {
      if (x.convertedMinor !== y.convertedMinor) return x.convertedMinor === null ? 1 : -1;
    } else if (x.convertedMinor !== y.convertedMinor) {
      return y.convertedMinor - x.convertedMinor;
    }
    return x.name.localeCompare(y.name, "ru");
  });

  const positive = converted.reduce(
    (sum, a) => (a.convertedMinor !== null && a.convertedMinor > 0 ? sum + a.convertedMinor : sum),
    0,
  );
  const rows = converted.map((a, toneIndex) => ({
    ...a,
    sharePermille:
      positive > 0 && a.convertedMinor !== null && a.convertedMinor > 0
        ? Math.round((a.convertedMinor * 1000) / positive)
        : 0,
    toneIndex,
  }));
  return { totalMinor, unconverted, rows };
}
