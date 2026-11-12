import { z } from "zod";
import { CURRENCY_CODES } from "@/lib/currency";
import { PALETTE_COLORS } from "@/lib/palette";

export const ACCOUNT_NAME_MAX = 40;

export const AccountName = z.string().trim().min(1).max(ACCOUNT_NAME_MAX);

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
