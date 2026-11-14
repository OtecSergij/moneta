import { and, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { db } from "@/db";
import { account, pendingSpaceJoins } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { findActiveInviteByToken } from "@/repositories/invites";
import { resolveSpace } from "@/repositories/spaces";
import {
  PASSWORD,
  asReply,
  finishGoogleSignIn,
  newEmail,
  signUpWith,
  startGoogleSignIn,
  userByEmail,
} from "@/test/auth-api";
import { mkInvite, mkSpaceUser, mkUser } from "@/test/factories";

vi.hoisted(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-client-secret");
});

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => {}) }));

const VERIFY_SUBJECT = "Подтвердите email — moneta";
const RESET_SUBJECT = "Сброс пароля — moneta";

function mailsTo(email: string, subject?: string) {
  return vi
    .mocked(sendEmail)
    .mock.calls.map(([mail]) => mail)
    .filter((mail) => mail.to === email && (!subject || mail.subject === subject));
}

function linkIn(text: string): URL {
  return new URL(text.match(/https?:\/\/\S+/)![0]);
}

async function signIn(email: string, password: string) {
  return asReply(() =>
    auth.api.signInEmail({ body: { email, password }, asResponse: true }),
  );
}

async function verifyByLink(link: URL) {
  return auth.api.verifyEmail({
    query: {
      token: link.searchParams.get("token")!,
      callbackURL: link.searchParams.get("callbackURL") ?? undefined,
    },
    asResponse: true,
  });
}

async function resetPasswordByMail(email: string, newPassword: string) {
  await auth.api.requestPasswordReset({
    body: { email, redirectTo: "/reset-password" },
  });
  const [mail] = mailsTo(email, RESET_SUBJECT);
  const token = linkIn(mail.text).pathname.split("/").pop()!;
  await auth.api.resetPassword({ body: { newPassword, token } });
}

async function unverifiedUser(extra: Record<string, unknown> = {}) {
  const email = newEmail();
  expect((await signUpWith(email, extra)).status).toBe(200);
  vi.mocked(sendEmail).mockClear();
  return email;
}

async function googleAccountOf(userId: string) {
  return db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "google")));
}

beforeEach(() => {
  vi.mocked(sendEmail).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe("sign-in with an unverified email", () => {
  it("right password: EMAIL_NOT_VERIFIED and exactly one verification email", async () => {
    const email = await unverifiedUser();

    const res = await signIn(email, PASSWORD);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(mailsTo(email, VERIFY_SUBJECT)).toHaveLength(1);
  });

  it("wrong password: the generic error and no email", async () => {
    const email = await unverifiedUser();

    const res = await signIn(email, "wrong-password-123");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ code: "INVALID_EMAIL_OR_PASSWORD" });
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("the link from that email verifies the address and signs the user in", async () => {
    const email = await unverifiedUser();
    await signIn(email, PASSWORD);

    const res = await verifyByLink(linkIn(mailsTo(email)[0].text));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.getSetCookie().join(";")).toContain(
      "better-auth.session_token=",
    );
    expect((await userByEmail(email)).emailVerified).toBe(true);
  });
});

describe("repeated sign-up", () => {
  function shape(body: { token: unknown; user: Record<string, unknown> }) {
    return {
      token: body.token,
      keys: Object.keys(body).sort(),
      userKeys: Object.keys(body.user).sort(),
      emailVerified: body.user.emailVerified,
    };
  }

  it("unverified email: the same answer as a new email and one fresh link", async () => {
    const email = await unverifiedUser();
    const forNew = await signUpWith(newEmail());
    vi.mocked(sendEmail).mockClear();

    const again = await signUpWith(email);

    expect(again.status).toBe(forNew.status);
    expect(shape(again.body)).toEqual(shape(forNew.body));
    expect(again.body.user.email).toBe(email);
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    expect(mailsTo(email, VERIFY_SUBJECT)).toHaveLength(1);

    const res = await verifyByLink(linkIn(mailsTo(email)[0].text));
    expect(res.status).toBe(302);
    expect((await userByEmail(email)).emailVerified).toBe(true);
  });

  it("verified email: the same answer and nothing sent", async () => {
    const existing = await mkUser();
    const forNew = await signUpWith(newEmail());
    vi.mocked(sendEmail).mockClear();

    const again = await signUpWith(existing.email);

    expect(again.status).toBe(forNew.status);
    expect(shape(again.body)).toEqual(shape(forNew.body));
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("from an invite, for a user who signed up through an earlier invite: one link, verifying it joins the space", async () => {
    const owner = await mkSpaceUser();
    const first = await mkInvite(owner.spaceId, owner.user.id);
    const email = await unverifiedUser({ inviteToken: first.token });
    const second = await mkInvite(owner.spaceId, owner.user.id);

    const again = await signUpWith(email, { inviteToken: second.token });

    expect(again.status).toBe(200);
    expect(mailsTo(email, VERIFY_SUBJECT)).toHaveLength(1);
    expect(await findActiveInviteByToken(second.token)).not.toBeNull();

    const res = await verifyByLink(linkIn(mailsTo(email)[0].text));
    expect(res.status).toBe(302);
    const created = await userByEmail(email);
    expect(created.emailVerified).toBe(true);
    expect(await resolveSpace(created.id)).toEqual({
      spaceId: owner.spaceId,
      role: "member",
    });
  });

  it("from an invite, for a user who signed up without one: one link, the invite is not claimed", async () => {
    const owner = await mkSpaceUser();
    const invite = await mkInvite(owner.spaceId, owner.user.id);
    const email = await unverifiedUser();

    const again = await signUpWith(email, { inviteToken: invite.token });

    expect(again.status).toBe(200);
    expect(mailsTo(email, VERIFY_SUBJECT)).toHaveLength(1);
    expect(await findActiveInviteByToken(invite.token)).not.toBeNull();
    const created = await userByEmail(email);
    expect(
      await db
        .select()
        .from(pendingSpaceJoins)
        .where(eq(pendingSpaceJoins.userId, created.id)),
    ).toEqual([]);
  });
});

describe("password reset", () => {
  it("marks the email verified; sign-in with the new password succeeds at once", async () => {
    const email = await unverifiedUser();

    await resetPasswordByMail(email, "brand-new-password");

    expect((await userByEmail(email)).emailVerified).toBe(true);
    vi.mocked(sendEmail).mockClear();
    const res = await signIn(email, "brand-new-password");
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});

describe("Google sign-in onto a local account", () => {
  it("unverified: account_not_linked back to the error callback page; after a reset it links", async () => {
    const email = await unverifiedUser();
    const created = await userByEmail(email);

    const refused = await finishGoogleSignIn(
      await startGoogleSignIn(undefined, "/login"),
      { email, name: "Гость" },
    );

    expect(refused).toBe("/login?error=account_not_linked");
    expect(await googleAccountOf(created.id)).toEqual([]);

    await resetPasswordByMail(email, "brand-new-password");
    const linked = await finishGoogleSignIn(
      await startGoogleSignIn(undefined, "/login"),
      { email, name: "Гость" },
    );

    expect(linked).not.toContain("error");
    expect(await googleAccountOf(created.id)).toHaveLength(1);
  });
});
