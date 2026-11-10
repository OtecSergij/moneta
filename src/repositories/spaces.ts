import { asc, desc, eq, sql } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import {
  pendingSpaceJoins,
  spaceInvites,
  spaceMembers,
  spaces,
  user,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import type { SpaceId } from "@/lib/space-id";

export type SpaceRole = "owner" | "member";
export type Membership = { spaceId: SpaceId; role: SpaceRole };

export type SpaceMember = {
  userId: string;
  name: string;
  email: string;
  role: SpaceRole;
  joinedAt: Date;
};

async function readMembership(
  executor: DbExecutor,
  userId: string,
): Promise<Membership | null> {
  const [row] = await executor
    .select({ spaceId: spaceMembers.spaceId, role: spaceMembers.role })
    .from(spaceMembers)
    .where(eq(spaceMembers.userId, userId))
    .limit(1);
  return row ? { spaceId: row.spaceId as SpaceId, role: row.role } : null;
}

export async function getMembership(
  userId: string,
): Promise<Membership | null> {
  return readMembership(db, userId);
}

export async function resolveSpace(userId: string): Promise<Membership> {
  const existing = await readMembership(db, userId);
  if (existing) return existing;

  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${userId}::text, 0))`,
      );

      const again = await readMembership(tx, userId);
      if (again) return again;

      const [pending] = await tx
        .delete(pendingSpaceJoins)
        .where(eq(pendingSpaceJoins.userId, userId))
        .returning({ spaceId: pendingSpaceJoins.spaceId });

      if (pending) {
        await tx
          .insert(spaceMembers)
          .values({ spaceId: pending.spaceId, userId, role: "member" });
        console.info("space.joined", { userId, spaceId: pending.spaceId });
        return { spaceId: pending.spaceId as SpaceId, role: "member" };
      }

      const [space] = await tx
        .insert(spaces)
        .values({})
        .returning({ id: spaces.id });
      await tx
        .insert(spaceMembers)
        .values({ spaceId: space.id, userId, role: "owner" });
      console.info("space.created", { userId, spaceId: space.id });

      const [claimed] = await tx
        .select({ id: spaceInvites.id })
        .from(spaceInvites)
        .where(eq(spaceInvites.usedBy, userId))
        .limit(1);
      if (claimed) console.warn("space.created_despite_claim", { userId });

      return { spaceId: space.id as SpaceId, role: "owner" };
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const winner = await readMembership(db, userId);
    if (!winner) throw err;
    console.info("space.resolve_conflict", { userId, spaceId: winner.spaceId });
    return winner;
  }
}

export async function listMembers(spaceId: SpaceId): Promise<SpaceMember[]> {
  return await db
    .select({
      userId: spaceMembers.userId,
      name: user.name,
      email: user.email,
      role: spaceMembers.role,
      joinedAt: spaceMembers.joinedAt,
    })
    .from(spaceMembers)
    .innerJoin(user, eq(user.id, spaceMembers.userId))
    .where(eq(spaceMembers.spaceId, spaceId))
    .orderBy(
      desc(sql`${spaceMembers.role} = 'owner'`),
      asc(spaceMembers.joinedAt),
    );
}
