import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { pendingSpaceJoins, spaceInvites, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { claimInvite, findActiveInviteByToken } from "@/repositories/invites";
import { resolveSpace } from "@/repositories/spaces";
import { mkInvite, mkSpaceUser, mkUser } from "@/test/factories";

vi.hoisted(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
});

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

// Real Google flow: sign-in stores the OAuth state and the callback reads it
// back; only the token endpoint is faked.
async function startGoogleSignIn(additionalData?: Record<string, unknown>) {
  const { headers, response } = await auth.api.signInSocial({
    body: { provider: "google", callbackURL: "/", additionalData },
    returnHeaders: true,
  });
  return {
    state: new URL(response.url!).searchParams.get("state")!,
    cookie: headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}

function fakeIdToken(claims: Record<string, unknown>): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "none" })}.${part(claims)}.`;
}

async function finishGoogleSignIn(
  started: { state: string; cookie: string },
  profile: { email: string; name: string },
) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json({
      access_token: "access-token",
      token_type: "Bearer",
      expires_in: 3600,
      id_token: fakeIdToken({
        sub: randomUUID(),
        email_verified: true,
        ...profile,
      }),
    }),
  );
  const res = await auth.api.callbackOAuth({
    params: { id: "google" },
    query: { code: "code", state: started.state },
    headers: new Headers({ cookie: started.cookie }),
    asResponse: true,
  });
  return res.headers.get("location") ?? "";
}

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.unstubAllEnvs();
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

describe("Google sign-in (OAuth state through Better Auth)", () => {
  it("(6a) invite in additionalData: the callback creates the user and claims the link", async () => {
    const owner = await mkSpaceUser();
    const invite = await mkInvite(owner.spaceId, owner.user.id);
    const email = newEmail();

    const started = await startGoogleSignIn({ inviteToken: invite.token });
    const location = await finishGoogleSignIn(started, { email, name: "Гость" });

    expect(location).not.toContain("error");
    const created = await userByEmail(email);
    expect((await inviteRow(invite.token)).usedBy).toBe(created.id);
    expect(await pendingFor(created.id)).toEqual([
      expect.objectContaining({ spaceId: owner.spaceId, inviteId: invite.id }),
    ]);
  });

  it("(6b) invite revoked before the callback: no user created, link not claimed", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const owner = await mkSpaceUser();
    const invite = await mkInvite(owner.spaceId, owner.user.id);
    const email = newEmail();

    const started = await startGoogleSignIn({ inviteToken: invite.token });
    await db
      .update(spaceInvites)
      .set({ revokedAt: new Date() })
      .where(eq(spaceInvites.id, invite.id));
    const location = await finishGoogleSignIn(started, { email, name: "Гость" });

    expect(location).toContain("error=unable_to_create_user");
    expect(await userByEmail(email)).toBeUndefined();
    expect((await inviteRow(invite.token)).usedBy).toBeNull();
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

  it("trims a long Google profile name by code points, keeping an emoji at the boundary whole", async () => {
    const email = newEmail();

    const location = await finishGoogleSignIn(await startGoogleSignIn(), {
      email,
      name: "я".repeat(59) + "😀😀",
    });

    expect(location).not.toContain("error");
    expect((await userByEmail(email))?.name).toBe("я".repeat(59) + "😀");
  });

  it("trims an over-long name on an update the before hook does not see", async () => {
    const u = await mkUser();
    const ctx = await auth.$context;

    await ctx.internalAdapter.updateUser(u.id, { name: "я".repeat(61) });

    expect((await userByEmail(u.email))?.name).toBe("я".repeat(60));
  });
});
