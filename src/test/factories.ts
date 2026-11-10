import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  fxRates,
  spaceInvites,
  spaceMembers,
  spaces,
  user,
} from "@/db/schema";
import { todayISO } from "@/lib/dates";
import type { SpaceId } from "@/lib/space-id";
import { CATEGORY_COLORS, createCategory } from "@/repositories/categories";
import {
  type Expense,
  type ExpenseInput,
  createExpense,
} from "@/repositories/expenses";
import { getMembership, resolveSpace } from "@/repositories/spaces";

type User = typeof user.$inferSelect;
export type SpaceUser = { user: User; spaceId: SpaceId };

export async function mkUser(
  overrides: Partial<typeof user.$inferInsert> = {},
): Promise<User> {
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

async function membershipOf(userId: string): Promise<SpaceId> {
  const membership = await getMembership(userId);
  if (!membership) throw new Error("factories: membership row is missing");
  return membership.spaceId;
}

// A user who signed up after phase 1: their space is a fresh random uuid, so
// space id !== user id.
export async function mkSpaceUser(
  overrides: Partial<typeof user.$inferInsert> = {},
): Promise<SpaceUser> {
  const u = await mkUser(overrides);
  const { spaceId } = await resolveSpace(u.id);
  return { user: u, spaceId };
}

// A user whose space came out of the phase-1 data migration (space id = user id).
export async function mkMigratedOwner(
  overrides: Partial<typeof user.$inferInsert> = {},
): Promise<SpaceUser> {
  const u = await mkUser(overrides);
  await db.insert(spaces).values({ id: u.id, createdAt: u.createdAt });
  await db
    .insert(spaceMembers)
    .values({ spaceId: u.id, userId: u.id, role: "owner", joinedAt: u.createdAt });
  return { user: u, spaceId: await membershipOf(u.id) };
}

export async function mkMember(
  spaceId: SpaceId,
  overrides: Partial<typeof user.$inferInsert> = {},
): Promise<SpaceUser> {
  const u = await mkUser(overrides);
  await db.insert(spaceMembers).values({ spaceId, userId: u.id, role: "member" });
  return { user: u, spaceId: await membershipOf(u.id) };
}

export async function mkInvite(
  spaceId: SpaceId,
  ownerId: string,
  overrides: Partial<typeof spaceInvites.$inferInsert> = {},
): Promise<typeof spaceInvites.$inferSelect> {
  const [row] = await db
    .insert(spaceInvites)
    .values({
      spaceId,
      createdBy: ownerId,
      token: randomBytes(16).toString("base64url"),
      ...overrides,
    })
    .returning();
  return row;
}

// Auto-creates a throwaway category when `overrides.categoryId` is omitted.
// Throws instead of returning null: a seeding test has no use for the null
// createExpense reserves for a rejected categoryId.
export async function mkExpense(
  spaceId: SpaceId,
  userId: string,
  overrides: Partial<ExpenseInput> = {},
): Promise<Expense> {
  // Unique name per call: (space_id, name) is unique, and names are capped at 40.
  const categoryId =
    overrides.categoryId ??
    (
      await createCategory(spaceId, userId, {
        name: `Test ${randomUUID().slice(0, 8)}`,
        color: CATEGORY_COLORS[0],
      })
    ).id;

  const row = await createExpense(spaceId, userId, {
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
