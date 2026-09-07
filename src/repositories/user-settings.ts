import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import type { CurrencyCode } from "@/lib/currency";
import { DisplayCurrencyInput, SalaryDaysInput } from "@/lib/settings";

// Re-exported from the DB-free @/lib/settings so server-side call sites keep
// importing from the repository (mirrors @/repositories/categories).
export { DisplayCurrencyInput, SalaryDaysInput };

// Returns the user's settings, or defaults when no row exists yet (rows are
// created lazily on first save).
export async function getUserSettings(
  userId: string,
): Promise<{ salaryDays: number[]; displayCurrency: CurrencyCode }> {
  const rows = await db
    .select({
      salaryDays: userSettings.salaryDays,
      displayCurrency: userSettings.displayCurrency,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return {
    salaryDays: rows[0]?.salaryDays ?? [],
    displayCurrency: rows[0]?.displayCurrency ?? "RUB",
  };
}

// Upsert the salary-day list for a user (one settings row per user). Returns
// the stored list.
export async function setSalaryDays(
  userId: string,
  salaryDays: number[],
): Promise<number[]> {
  const [row] = await db
    .insert(userSettings)
    .values({ userId, salaryDays })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { salaryDays, updatedAt: new Date() },
    })
    .returning({ salaryDays: userSettings.salaryDays });
  return row.salaryDays;
}

// Upsert the display currency for a user (one settings row per user).
// Returns the stored value.
export async function setDisplayCurrency(
  userId: string,
  displayCurrency: CurrencyCode,
): Promise<CurrencyCode> {
  const [row] = await db
    .insert(userSettings)
    .values({ userId, displayCurrency })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { displayCurrency, updatedAt: new Date() },
    })
    .returning({ displayCurrency: userSettings.displayCurrency });
  return row.displayCurrency;
}
