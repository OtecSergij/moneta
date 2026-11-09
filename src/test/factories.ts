import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { fxRates, user } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { CATEGORY_COLORS, createCategory } from "@/repositories/categories";
import {
  type Expense,
  type ExpenseInput,
  createExpense,
} from "@/repositories/expenses";

export async function mkUser(
  overrides: Partial<typeof user.$inferInsert> = {},
): Promise<typeof user.$inferSelect> {
  const email = `${randomUUID()}@test.local`;
  const [row] = await db
    .insert(user)
    .values({
      email,
      name: "Test User",
      emailVerified: true,
      ...overrides,
    })
    .returning();
  return row;
}

// Creates an expense for `userId`, auto-creating a throwaway category when
// `overrides.categoryId` is omitted — most itest scenarios don't care which
// category a row lands in, only that createExpense accepts it. Throws (rather
// than returning null) on failure, since a test that's just seeding data has
// no use for the null case createExpense reserves for a rejected categoryId.
export async function mkExpense(
  userId: string,
  overrides: Partial<ExpenseInput> = {},
): Promise<Expense> {
  // Unique per call, not a fixed "Test": categories has a unique index on
  // (user_id, name) (db/schema/categories.ts), and a caller creating several
  // expenses for the same user without a categoryId override would otherwise
  // collide on the second call. Sliced to 8 hex chars — categories.name is
  // capped at 40 (CATEGORY_NAME_MAX / the categories_name_len CHECK), and a
  // full UUID alone would already blow past that.
  const categoryId =
    overrides.categoryId ??
    (
      await createCategory(userId, {
        name: `Test ${randomUUID().slice(0, 8)}`,
        color: CATEGORY_COLORS[0],
      })
    ).id;

  const row = await createExpense(userId, {
    amountMinor: 1000,
    currency: "RUB",
    note: "тест",
    spentAt: todayISO(),
    ...overrides,
    categoryId,
  });
  if (!row) {
    throw new Error("mkExpense: createExpense returned null");
  }
  return row;
}

// fx_rates has no user_id (db/schema/fx-rates.ts): it is one global table, and
// the integration project runs every file in a single fork against a single
// database (vitest.config.ts). Every itest touching rates clears them first,
// so a rate seeded by one test can't satisfy another's nearest-earlier lookup
// — which is otherwise invisible, since the reader finds *a* rate and simply
// converts by the wrong one.
export async function clearRates(): Promise<void> {
  await db.delete(fxRates);
}

// Inserts one fx_rates row directly. Pair with clearRates() above in a
// beforeEach so each test seeds exactly the rates it means to exercise.
export async function mkRate(
  overrides: Partial<typeof fxRates.$inferInsert> &
    Pick<typeof fxRates.$inferInsert, "currency" | "effectiveDate">,
): Promise<typeof fxRates.$inferSelect> {
  const [row] = await db
    .insert(fxRates)
    .values({
      rateToUsd: "1.00000000000000000000",
      source: "test",
      ...overrides,
    })
    .returning();
  return row;
}
