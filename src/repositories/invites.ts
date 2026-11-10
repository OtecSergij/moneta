import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  pendingSpaceJoins,
  spaceInvites,
  spaceMembers,
  spaces,
  user,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { INVITE_TTL_DAYS, generateInviteToken } from "@/lib/invites";
import type { SpaceId } from "@/lib/space-id";

const isOpen = and(isNull(spaceInvites.usedAt), isNull(spaceInvites.revokedAt));

const isActive = and(
  isOpen,
  sql`${spaceInvites.createdAt} > now() - make_interval(days => ${INVITE_TTL_DAYS}::int)`,
);

const ownerOfInviteSpace = and(
  eq(spaceMembers.spaceId, spaceInvites.spaceId),
  eq(spaceMembers.role, "owner"),
);

export async function createInvite(
  spaceId: SpaceId,
  userId: string,
): Promise<{ token: string } | null> {
  try {
    const created = await db.transaction(async (tx) => {
      await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(eq(spaces.id, spaceId))
        .for("update");

      const [owner] = await tx
        .select({ userId: spaceMembers.userId })
        .from(spaceMembers)
        .where(
          and(
            eq(spaceMembers.spaceId, spaceId),
            eq(spaceMembers.userId, userId),
            eq(spaceMembers.role, "owner"),
          ),
        )
        .limit(1);
      if (!owner) return null;

      await tx
        .update(spaceInvites)
        .set({ revokedAt: sql`now()` })
        .where(and(eq(spaceInvites.spaceId, spaceId), isOpen));

      const token = generateInviteToken();
      const [row] = await tx
        .insert(spaceInvites)
        .values({ spaceId, token, createdBy: userId })
        .returning({ id: spaceInvites.id });
      return { token, inviteId: row.id };
    });

    if (!created) return null;
    console.info("invite.created", {
      spaceId,
      userId,
      inviteId: created.inviteId,
    });
    return { token: created.token };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    const active = await getActiveInviteForOwner(spaceId, userId);
    if (!active) throw err;
    return { token: active.token };
  }
}

export async function getActiveInviteForOwner(
  spaceId: SpaceId,
  userId: string,
): Promise<{ token: string; createdAt: Date } | null> {
  const [row] = await db
    .select({ token: spaceInvites.token, createdAt: spaceInvites.createdAt })
    .from(spaceInvites)
    .innerJoin(
      spaceMembers,
      and(ownerOfInviteSpace, eq(spaceMembers.userId, userId)),
    )
    .where(and(eq(spaceInvites.spaceId, spaceId), isActive))
    .orderBy(desc(spaceInvites.createdAt))
    .limit(1);
  return row ?? null;
}

export async function findActiveInviteByToken(
  token: string,
): Promise<{ inviteId: string; spaceId: string; ownerName: string } | null> {
  const [row] = await db
    .select({
      inviteId: spaceInvites.id,
      spaceId: spaceInvites.spaceId,
      ownerName: user.name,
    })
    .from(spaceInvites)
    .innerJoin(spaceMembers, ownerOfInviteSpace)
    .innerJoin(user, eq(user.id, spaceMembers.userId))
    .where(and(eq(spaceInvites.token, token), isActive))
    .limit(1);
  return row ?? null;
}

export async function claimInvite(
  userId: string,
  token: string,
): Promise<{ spaceId: string } | null> {
  const claimed = await db.transaction(async (tx) => {
    const [invite] = await tx
      .update(spaceInvites)
      .set({ usedAt: sql`now()`, usedBy: userId })
      .where(and(eq(spaceInvites.token, token), isActive))
      .returning({ id: spaceInvites.id, spaceId: spaceInvites.spaceId });
    if (!invite) return null;

    await tx
      .insert(pendingSpaceJoins)
      .values({ userId, spaceId: invite.spaceId, inviteId: invite.id })
      .onConflictDoNothing();
    return invite;
  });

  if (!claimed) {
    console.warn("invite.claim_lost", { userId });
    return null;
  }
  console.info("invite.claimed", {
    userId,
    spaceId: claimed.spaceId,
    inviteId: claimed.id,
  });
  return { spaceId: claimed.spaceId };
}
