import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { pendingSpaceJoins, spaceInvites, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { afterUserCreate, beforeUserCreate } from "@/lib/auth-invite-hook";
import { claimInvite, findActiveInviteByToken } from "@/repositories/invites";
import { resolveSpace } from "@/repositories/spaces";
import { mkInvite, mkSpaceUser, mkUser } from "@/test/factories";

vi.mock("@/repositories/invites", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/repositories/invites")>();
  return { ...original, claimInvite: vi.fn(original.claimInvite) };
});

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const UNKNOWN_TOKEN = "AAAAAAAAAAAAAAAAAAAAAA";

function newEmail(): string {
  return `${randomUUID()}@test.local`;
}

// A before-hook APIError is thrown even with asResponse; the HTTP router turns
// it into a response with the same status and body.
async function signUp(email: string, inviteToken: unknown) {
  return signUpWith(email, { inviteToken });
}

async function signUpWith(email: string, extra: Record<string, unknown>) {
  try {
    const res = await auth.api.signUpEmail({
      body: {
        email,
        password: "correct-horse-battery",
        name: email.split("@")[0],
        ...extra,
      } as { email: string; password: string; name: string },
      asResponse: true,
    });
    return { status: res.status, body: await res.json() };
  } catch (err) {
    if (!isAPIError(err)) throw err;
    return { status: err.statusCode, body: err.body };
  }
}

async function userByEmail(email: string) {
  const [row] = await db.select().from(user).where(eq(user.email, email));
  return row;
}

async function inviteRow(token: string) {
  const [row] = await db
    .select()
    .from(spaceInvites)
    .where(eq(spaceInvites.token, token));
  return row;
}

async function pendingFor(userId: string) {
  return db
    .select()
    .from(pendingSpaceJoins)
    .where(eq(pendingSpaceJoins.userId, userId));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sign-up with an invite (auth.api.signUpEmail)", () => {
  it("(1) active token + new email: 200, link claimed by the new user, pending join recorded", async () => {
    const owner = await mkSpaceUser();
    const invite = await mkInvite(owner.spaceId, owner.user.id);
    const email = newEmail();

    const res = await signUp(email, invite.token);

    expect(res.status).toBe(200);
    const created = await userByEmail(email);
    expect(created).toBeDefined();
    expect((await inviteRow(invite.token)).usedBy).toBe(created.id);
    expect(await pendingFor(created.id)).toEqual([
      expect.objectContaining({ spaceId: owner.spaceId, inviteId: invite.id }),
    ]);
  });

  it("(2) bogus token: same INVITE_INVALID reply for new and existing email, no user created", async () => {
    const existing = await mkUser();
    const email = newEmail();

    for (const token of [UNKNOWN_TOKEN, "short", 42, ""]) {
      const forNew = await signUp(email, token);
      const forExisting = await signUp(existing.email, token);

      expect(forNew.status).toBe(400);
      expect(forNew.body).toMatchObject({ code: "INVITE_INVALID" });
      expect(forExisting).toEqual(forNew);
    }
    expect(await userByEmail(email)).toBeUndefined();
  });

  it("(2b) token in additionalData is ignored: plain sign-up, same reply for new and existing email", async () => {
    const existing = await mkUser();
    const email = newEmail();
    const extra = { additionalData: { inviteToken: UNKNOWN_TOKEN } };

    const forNew = await signUpWith(email, extra);
    const forExisting = await signUpWith(existing.email, extra);

    expect(forNew.status).toBe(200);
    expect(forExisting.status).toBe(200);
    expect(Object.keys(forExisting.body).sort()).toEqual(
      Object.keys(forNew.body).sort(),
    );
    const created = await userByEmail(email);
    expect(created).toBeDefined();
    expect(await pendingFor(created.id)).toEqual([]);
  });

  it("(3) active token + existing email: 200, nothing created, link stays active", async () => {
    const owner = await mkSpaceUser();
    const invite = await mkInvite(owner.spaceId, owner.user.id);
    const existing = await mkUser();

    const res = await signUp(existing.email, invite.token);

    expect(res.status).toBe(200);
    expect(await findActiveInviteByToken(invite.token)).not.toBeNull();
    expect(await pendingFor(existing.id)).toEqual([]);
  });

  it("(4) revoked and expired tokens: same INVITE_INVALID for new and existing email", async () => {
    const owner = await mkSpaceUser();
    const revoked = await mkInvite(owner.spaceId, owner.user.id, {
      revokedAt: new Date(),
    });
    const expired = await mkInvite(owner.spaceId, owner.user.id, {
      createdAt: new Date(Date.now() - 7 * DAY - MINUTE),
    });
    const existing = await mkUser();

    for (const token of [revoked.token, expired.token]) {
      const email = newEmail();
      const forNew = await signUp(email, token);
      const forExisting = await signUp(existing.email, token);

      expect(forNew.status).toBe(400);
      expect(forNew.body).toMatchObject({ code: "INVITE_INVALID" });
      expect(forExisting).toEqual(forNew);
      expect(await userByEmail(email)).toBeUndefined();
    }
  });

  it("(5) claimInvite failure: sign-up still 200, invite.claim_failed logged, user gets an own space", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(claimInvite).mockRejectedValueOnce(new Error("boom"));
    const owner = await mkSpaceUser();
    const invite = await mkInvite(owner.spaceId, owner.user.id);
    const email = newEmail();

    const res = await signUp(email, invite.token);

    expect(res.status).toBe(200);
    const created = await userByEmail(email);
    expect(error).toHaveBeenCalledWith("invite.claim_failed", {
      userId: created.id,
    });
    const membership = await resolveSpace(created.id);
    expect(membership.role).toBe("owner");
    expect(membership.spaceId).not.toBe(owner.spaceId);
  });
});

describe("OAuth path (hooks with OAuth state)", () => {
  it("(6a) afterUserCreate claims the link from OAuth state", async () => {
    const owner = await mkSpaceUser();
    const invite = await mkInvite(owner.spaceId, owner.user.id);
    const u = await mkUser();

    await afterUserCreate(u, null, {
      readOAuthState: async () => ({ inviteToken: invite.token }),
    });

    expect((await inviteRow(invite.token)).usedBy).toBe(u.id);
    expect(await pendingFor(u.id)).toHaveLength(1);
  });

  it("(6b) beforeUserCreate rejects a revoked token from OAuth state", async () => {
    const owner = await mkSpaceUser();
    const revoked = await mkInvite(owner.spaceId, owner.user.id, {
      revokedAt: new Date(),
    });

    expect(
      await beforeUserCreate({}, null, {
        readOAuthState: async () => ({ inviteToken: revoked.token }),
      }),
    ).toBe(false);
  });
});

describe("display name length", () => {
  it("rejects a sign-up name over 60 characters and accepts exactly 60", async () => {
    const tooLong = newEmail();
    const res = await signUpWith(tooLong, { name: "я".repeat(61) });
    expect(res.status).toBe(400);
    expect(await userByEmail(tooLong)).toBeUndefined();

    const fits = newEmail();
    expect((await signUpWith(fits, { name: "я".repeat(60) })).status).toBe(200);
    expect((await userByEmail(fits))?.name).toBe("я".repeat(60));
  });
});
