import { count, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { pendingSpaceJoins, spaceMembers, spaces } from "@/db/schema";
import {
  getMembership,
  getSpaceOwner,
  listMembers,
  resolveSpace,
} from "@/repositories/spaces";
import {
  mkInvite,
  mkMember,
  mkSpaceUser,
  mkUser,
} from "@/test/factories";

async function spaceCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(spaces);
  return row.n;
}

async function membershipRows(userId: string) {
  return db.select().from(spaceMembers).where(eq(spaceMembers.userId, userId));
}

async function mkPendingJoin(userId: string) {
  const owner = await mkSpaceUser();
  const invite = await mkInvite(owner.spaceId, owner.user.id, {
    usedAt: new Date(),
    usedBy: userId,
  });
  await db
    .insert(pendingSpaceJoins)
    .values({ userId, spaceId: owner.spaceId, inviteId: invite.id });
  return owner;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveSpace", () => {
  it("without a pending join makes the user owner of a fresh space", async () => {
    const u = await mkUser();
    const before = await spaceCount();

    const result = await resolveSpace(u.id);

    expect(result.role).toBe("owner");
    expect(result.spaceId).not.toBe(u.id);
    expect(await spaceCount()).toBe(before + 1);
    expect(await membershipRows(u.id)).toEqual([
      expect.objectContaining({ spaceId: result.spaceId, role: "owner" }),
    ]);
  });

  it("with a pending join makes the user a member of that space and consumes the pending row", async () => {
    const u = await mkUser();
    const owner = await mkPendingJoin(u.id);
    const before = await spaceCount();

    const result = await resolveSpace(u.id);

    expect(result).toEqual({ spaceId: owner.spaceId, role: "member" });
    expect(await spaceCount()).toBe(before);
    expect(await membershipRows(u.id)).toHaveLength(1);
    expect(
      await db
        .select()
        .from(pendingSpaceJoins)
        .where(eq(pendingSpaceJoins.userId, u.id)),
    ).toEqual([]);
  });

  it("is idempotent: a second call returns the same membership and changes nothing", async () => {
    const u = await mkUser();
    const first = await resolveSpace(u.id);
    const before = await spaceCount();

    const second = await resolveSpace(u.id);

    expect(second).toEqual(first);
    expect(await spaceCount()).toBe(before);
    expect(await membershipRows(u.id)).toHaveLength(1);
    expect(await getMembership(u.id)).toEqual(first);
  });

  it("five parallel calls produce one membership and one space", async () => {
    const u = await mkUser();
    const before = await spaceCount();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => resolveSpace(u.id)),
    );

    expect(new Set(results.map((r) => r.spaceId)).size).toBe(1);
    expect(results.every((r) => r.role === "owner")).toBe(true);
    expect(await spaceCount()).toBe(before + 1);
    expect(await membershipRows(u.id)).toHaveLength(1);
  });

  it("logs space.created without the email", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const u = await mkUser();

    const { spaceId } = await resolveSpace(u.id);

    expect(info).toHaveBeenCalledWith("space.created", {
      userId: u.id,
      spaceId,
    });
    expect(warn).not.toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toContain(u.email);
  });

  it("logs space.joined without the email", async () => {
    const u = await mkUser();
    const owner = await mkPendingJoin(u.id);
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    await resolveSpace(u.id);

    expect(info).toHaveBeenCalledWith("space.joined", {
      userId: u.id,
      spaceId: owner.spaceId,
    });
    expect(info).not.toHaveBeenCalledWith("space.created", expect.anything());
    expect(JSON.stringify(info.mock.calls)).not.toContain(u.email);
  });

  it("warns space.created_despite_claim when the user claimed an invite but has no pending join", async () => {
    const u = await mkUser();
    const owner = await mkSpaceUser();
    await mkInvite(owner.spaceId, owner.user.id, {
      usedAt: new Date(),
      usedBy: u.id,
    });
    vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await resolveSpace(u.id);

    expect(result.role).toBe("owner");
    expect(result.spaceId).not.toBe(owner.spaceId);
    expect(warn).toHaveBeenCalledWith("space.created_despite_claim", {
      userId: u.id,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain(u.email);
  });
});

describe("listMembers / getSpaceOwner", () => {
  it("lists the owner first, then members by joined_at, with name, email, role and joinedAt", async () => {
    const owner = await mkSpaceUser({ name: "Owner" });
    const late = await mkMember(owner.spaceId, { name: "Late" });
    const early = await mkMember(owner.spaceId, { name: "Early" });
    const t = (iso: string) => new Date(iso);
    await db
      .update(spaceMembers)
      .set({ joinedAt: t("2026-03-01T00:00:00Z") })
      .where(eq(spaceMembers.userId, owner.user.id));
    await db
      .update(spaceMembers)
      .set({ joinedAt: t("2026-02-01T00:00:00Z") })
      .where(eq(spaceMembers.userId, late.user.id));
    await db
      .update(spaceMembers)
      .set({ joinedAt: t("2026-01-01T00:00:00Z") })
      .where(eq(spaceMembers.userId, early.user.id));

    expect(await listMembers(owner.spaceId)).toEqual([
      {
        userId: owner.user.id,
        name: "Owner",
        email: owner.user.email,
        role: "owner",
        joinedAt: t("2026-03-01T00:00:00Z"),
      },
      {
        userId: early.user.id,
        name: "Early",
        email: early.user.email,
        role: "member",
        joinedAt: t("2026-01-01T00:00:00Z"),
      },
      {
        userId: late.user.id,
        name: "Late",
        email: late.user.email,
        role: "member",
        joinedAt: t("2026-02-01T00:00:00Z"),
      },
    ]);
  });

  it("does not list members of another space", async () => {
    const a = await mkSpaceUser();
    const b = await mkSpaceUser();

    const members = await listMembers(a.spaceId);

    expect(members.map((m) => m.userId)).toEqual([a.user.id]);
    expect(members.map((m) => m.userId)).not.toContain(b.user.id);
  });

  it("getSpaceOwner returns the owner's id and name", async () => {
    const owner = await mkSpaceUser({ name: "Хозяин" });
    await mkMember(owner.spaceId);

    expect(await getSpaceOwner(owner.spaceId)).toEqual({
      userId: owner.user.id,
      name: "Хозяин",
    });
  });
});
