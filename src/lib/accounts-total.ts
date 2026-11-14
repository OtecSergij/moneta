import type { CurrencyCode } from "@/lib/currency";
import {
  type ConvertibleRow,
  type RateIndex,
  convertRow,
  sumConverted,
} from "@/lib/fx/convert";

export type AccountBalance = {
  id: string;
  name: string;
  currency: CurrencyCode;
  color: string;
  balanceMinor: number;
};

export type AccountSummaryRow = AccountBalance & {
  convertedMinor: number | null;
  sharePermille: number;
};

export type AccountsSummary = {
  totalMinor: number;
  unconverted: number;
  rows: AccountSummaryRow[];
};

function toRow(
  account: Pick<AccountBalance, "balanceMinor" | "currency">,
  today: string,
): ConvertibleRow {
  return { amountMinor: account.balanceMinor, currency: account.currency, spentAt: today };
}

export function balanceInDisplay(
  account: Pick<AccountBalance, "balanceMinor" | "currency">,
  display: CurrencyCode,
  index: RateIndex,
  today: string,
): number | null {
  return convertRow(toRow(account, today), display, index);
}

export function summarizeAccounts(
  accounts: AccountBalance[],
  display: CurrencyCode,
  index: RateIndex,
  today: string,
): AccountsSummary {
  const convertible = accounts.map((a) => toRow(a, today));
  const { totalMinor, unconverted } = sumConverted(convertible, display, index);

  const converted = accounts.map((a) => ({
    ...a,
    convertedMinor: balanceInDisplay(a, display, index, today),
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
  const rows = converted.map((a) => ({
    ...a,
    sharePermille:
      positive > 0 && a.convertedMinor !== null && a.convertedMinor > 0
        ? Math.round((a.convertedMinor * 1000) / positive)
        : 0,
  }));
  return { totalMinor, unconverted, rows };
}
