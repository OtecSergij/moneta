import type { CurrencyCode } from "@/lib/currency";

type AccountOption = { id: string; currency: CurrencyCode };

export function defaultAccountSelection(
  accounts: readonly AccountOption[],
  lastAccountId: string | null,
): { accountId: string; currency: CurrencyCode } | null {
  const account = accounts.find((a) => a.id === lastAccountId) ?? accounts[0];
  return account ? { accountId: account.id, currency: account.currency } : null;
}
