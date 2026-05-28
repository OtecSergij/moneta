import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { categories, user } from "@/db/schema";
import { CATEGORY_COLORS } from "@/repositories/categories";

// Insert directly via the schema (not via repos) so test setup doesn't
// depend on the layer it's testing. The `user` table is owned by Better
// Auth at runtime — for tests we just need a real row to attach FKs to.

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

export async function mkCategory(
  userId: string,
  overrides: Partial<typeof categories.$inferInsert> = {},
): Promise<typeof categories.$inferSelect> {
  const [row] = await db
    .insert(categories)
    .values({
      userId,
      name: `Cat-${randomUUID().slice(0, 8)}`,
      color: CATEGORY_COLORS[0],
      ...overrides,
    })
    .returning();
  return row;
}
