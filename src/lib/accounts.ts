import { z } from "zod";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import { minorToInput, parseMoney } from "@/lib/money";
import { PALETTE_COLORS } from "@/lib/palette";

export const ACCOUNT_NAME_MAX = 40;

const AccountName = z.string().trim().min(1).max(ACCOUNT_NAME_MAX);

export const AccountInput = z.object({
  name: AccountName,
  currency: z.enum(CURRENCY_CODES),
  color: z.enum(PALETTE_COLORS),
  balanceMinor: z.int().nonnegative(),
});
export type AccountInput = z.infer<typeof AccountInput>;

export const AccountPatch = z
  .object({
    name: AccountName.optional(),
    color: z.enum(PALETTE_COLORS).optional(),
    balanceMinor: z.int().nonnegative().optional(),
    loadedBalanceMinor: z.int().optional(),
  })
  .refine(
    (p) => (p.balanceMinor === undefined) === (p.loadedBalanceMinor === undefined),
    { path: ["loadedBalanceMinor"] },
  )
  .refine(
    (p) => p.name !== undefined || p.color !== undefined || p.balanceMinor !== undefined,
  );
export type AccountPatch = z.infer<typeof AccountPatch>;

type BalanceEntry =
  | { kind: "invalid" }
  | { kind: "unchanged" }
  | { kind: "patch"; patch: { balanceMinor: number; loadedBalanceMinor: number } };

export function balanceEntry(
  input: string,
  loadedBalanceMinor: number,
  currency: CurrencyCode,
): BalanceEntry {
  const balanceMinor =
    input === minorToInput(loadedBalanceMinor, currency)
      ? loadedBalanceMinor
      : parseMoney(input, currency);
  if (balanceMinor === null) return { kind: "invalid" };
  if (balanceMinor === loadedBalanceMinor) return { kind: "unchanged" };
  return { kind: "patch", patch: { balanceMinor, loadedBalanceMinor } };
}

export function canDeleteAccount(account: { expenseCount: number }): boolean {
  return account.expenseCount === 0;
}
