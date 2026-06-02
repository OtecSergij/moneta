import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { user } from "@/db/schema";

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
