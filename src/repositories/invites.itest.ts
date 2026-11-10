import { and, eq, isNull } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { pendingSpaceJoins, spaceInvites } from "@/db/schema";
import {
  claimInvite,
  createInvite,
  findActiveInviteByToken,
  getActiveInviteForOwner,
} from "@/repositories/invites";
import { mkInvite, mkMember, mkSpaceUser, mkUser } from "@/test/factories";
import type { SpaceId } from "@/lib/space-id";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

async function openInvites(spaceId: SpaceId) {
  return db
    .select()
    .from(spaceInvites)
    .where(
      and(
        eq(spaceInvites.spaceId, spaceId),
        isNull(spaceInvites.usedAt),
        isNull(spaceInvites.revokedAt),
      ),
    );
}

async function inviteByToken(token: string) {
  const [row] = await db
    .select()
    .from(spaceInvites)
    .where(eq(spaceInvites.token, token));
  return row;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createInvite", () => {
  it("lets only the owner create a link", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);

    expect(await createInvite(owner.spaceId, member.user.id)).toBeNull();
    expect(await openInvites(owner.spaceId)).toHaveLength(0);

    const created = await createInvite(owner.spaceId, owner.user.id);
    expect(created?.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("revokes the previous link so only one stays active", async () => {
    const owner = await mkSpaceUser();
    const first = await createInvite(owner.spaceId, owner.user.id);
    const second = await createInvite(owner.spaceId, owner.user.id);

    expect(second!.token).not.toBe(first!.token);
    expect((await inviteByToken(first!.token)).revokedAt).not.toBeNull();
    const open = await openInvites(owner.spaceId);
    expect(open.map((r) => r.token)).toEqual([second!.token]);
    expect(await findActiveInviteByToken(first!.token)).toBeNull();
  });

  it("survives two parallel calls with one active link and no exception", async () => {
    const owner = await mkSpaceUser();
    const results = await Promise.all([
      createInvite(owner.spaceId, owner.user.id),
      createInvite(owner.spaceId, owner.user.id),
    ]);

    expect(results.every((r) => r !== null)).toBe(true);
    const open = await openInvites(owner.spaceId);
    expect(open).toHaveLength(1);
    expect(results.map((r) => r!.token)).toContain(open[0].token);
  });

  it("revokes an expired open link and creates a new one without 23505", async () => {
    const owner = await mkSpaceUser();
    const expired = await mkInvite(owner.spaceId, owner.user.id, {
      createdAt: new Date(Date.now() - 7 * DAY - MINUTE),
    });

    const created = await createInvite(owner.spaceId, owner.user.id);

    expect(created).not.toBeNull();
    expect((await inviteByToken(expired.token)).revokedAt).not.toBeNull();
    expect((await openInvites(owner.spaceId)).map((r) => r.token)).toEqual([
      created!.token,
    ]);
  });

  it("logs invite.created without the token", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const owner = await mkSpaceUser();
    const created = await createInvite(owner.spaceId, owner.user.id);

    const call = info.mock.calls.find(([event]) => event === "invite.created");
    expect(call).toBeDefined();
    expect(JSON.stringify(call)).not.toContain(created!.token);
  });
});

describe("getActiveInviteForOwner", () => {
  it("returns the active link to the owner and null to a member", async () => {
    const owner = await mkSpaceUser();
    const member = await mkMember(owner.spaceId);
    const created = await createInvite(owner.spaceId, owner.user.id);

    expect(await getActiveInviteForOwner(owner.spaceId, owner.user.id)).toEqual(
      { token: created!.token, createdAt: expect.any(Date) },
    );
    expect(
      await getActiveInviteForOwner(owner.spaceId, member.user.id),
    ).toBeNull();
  });

  it("returns null when there is no active link", async () => {
    const owner = await mkSpaceUser();
    await mkInvite(owner.spaceId, owner.user.id, { revokedAt: new Date() });
    expect(
      await getActiveInviteForOwner(owner.spaceId, owner.user.id),
    ).toBeNull();
  });
});

describe("findActiveInviteByToken", () => {
  it("returns the invite with the owner's name", async () => {
    const owner = await mkSpaceUser({ name: "Анна" });
    const invite = await mkInvite(owner.spaceId, owner.user.id);

    expect(await findActiveInviteByToken(invite.token)).toEqual({
      inviteId: invite.id,
      spaceId: owner.spaceId,
      ownerName: "Анна",
    });
  });

  it("returns null for an unknown token", async () => {
    expect(
      await findActiveInviteByToken("AAAAAAAAAAAAAAAAAAAAAA"),
    ).toBeNull();
  });
});

describe("claimInvite", () => {
  it("is single-use and records a pending join", async () => {
    const owner = await mkSpaceUser();
    const invite = await mkInvite(owner.spaceId, owner.user.id);
    const first = await mkUser();
    const second = await mkUser();

    expect(await claimInvite(first.id, invite.token)).toEqual({
      spaceId: owner.spaceId,
    });
    expect(await claimInvite(second.id, invite.token)).toBeNull();

    const row = await inviteByToken(invite.token);
    expect(row.usedBy).toBe(first.id);
    expect(row.usedAt).not.toBeNull();
    const pending = await db
      .select()
      .from(pendingSpaceJoins)
      .where(eq(pendingSpaceJoins.userId, first.id));
    expect(pending).toEqual([
      expect.objectContaining({ spaceId: owner.spaceId, inviteId: invite.id }),
    ]);
  });

  it("does not claim a revoked or used link", async () => {
    const owner = await mkSpaceUser();
    const used = await mkUser();
    const revoked = await mkInvite(owner.spaceId, owner.user.id, {
      revokedAt: new Date(),
    });
    const spent = await mkInvite(owner.spaceId, owner.user.id, {
      usedAt: new Date(),
      usedBy: used.id,
    });
    const u = await mkUser();

    expect(await claimInvite(u.id, revoked.token)).toBeNull();
    expect(await claimInvite(u.id, spent.token)).toBeNull();
  });

  it("logs invite.claimed without the token", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const owner = await mkSpaceUser();
    const invite = await mkInvite(owner.spaceId, owner.user.id);
    const u = await mkUser();

    await claimInvite(u.id, invite.token);

    const call = info.mock.calls.find(([event]) => event === "invite.claimed");
    expect(call).toBeDefined();
    expect(JSON.stringify(call)).not.toContain(invite.token);
  });
});

describe("TTL", () => {
  it("keeps a link created 7 days minus a minute ago active", async () => {
    const owner = await mkSpaceUser();
    const invite = await mkInvite(owner.spaceId, owner.user.id, {
      createdAt: new Date(Date.now() - 7 * DAY + MINUTE),
    });
    const u = await mkUser();

    expect(await findActiveInviteByToken(invite.token)).not.toBeNull();
    expect(
      await getActiveInviteForOwner(owner.spaceId, owner.user.id),
    ).not.toBeNull();
    expect(await claimInvite(u.id, invite.token)).not.toBeNull();
  });

  it("treats a link created 7 days plus a minute ago as invalid", async () => {
    const owner = await mkSpaceUser();
    const invite = await mkInvite(owner.spaceId, owner.user.id, {
      createdAt: new Date(Date.now() - 7 * DAY - MINUTE),
    });
    const u = await mkUser();

    expect(await findActiveInviteByToken(invite.token)).toBeNull();
    expect(
      await getActiveInviteForOwner(owner.spaceId, owner.user.id),
    ).toBeNull();
    expect(await claimInvite(u.id, invite.token)).toBeNull();
  });
});
