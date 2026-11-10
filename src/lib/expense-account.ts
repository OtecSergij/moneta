import type { CurrencyCode } from "@/lib/currency";

type AccountOption = { id: string; currency: CurrencyCode };

export function pickAccountCurrency(
  accounts: readonly AccountOption[],
  accountId: string | null,
  fallback: CurrencyCode,
): CurrencyCode {
  return accounts.find((a) => a.id === accountId)?.currency ?? fallback;
}

export function knownAccountId(
  accounts: readonly AccountOption[],
  accountId: string | null,
): string | null {
  return accounts.some((a) => a.id === accountId) ? accountId : null;
}

export function defaultAccountSelection({
  accounts,
  lastAccountId,
  lastCurrency,
  displayCurrency,
}: {
  accounts: readonly AccountOption[];
  lastAccountId: string | null;
  lastCurrency: CurrencyCode | null;
  displayCurrency: CurrencyCode;
}): { accountId: string | null; currency: CurrencyCode } {
  const last = accounts.find((a) => a.id === lastAccountId);
  if (last) return { accountId: last.id, currency: last.currency };
  return { accountId: null, currency: lastCurrency ?? displayCurrency };
}
