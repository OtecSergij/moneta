import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { isAPIError } from "better-auth/api";
import { vi } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";

export const PASSWORD = "correct-horse-battery";

export function newEmail(): string {
  return `${randomUUID()}@test.local`;
}

// A before-hook APIError is thrown even with asResponse; the HTTP router turns
// it into a response with the same status and body.
export async function asReply(call: () => Promise<Response>) {
  try {
    const res = await call();
    return { status: res.status, body: await res.json() };
  } catch (err) {
    if (!isAPIError(err)) throw err;
    return { status: err.statusCode, body: err.body };
  }
}

export async function signUpWith(
  email: string,
  extra: Record<string, unknown> = {},
) {
  return asReply(() =>
    auth.api.signUpEmail({
      body: {
        email,
        password: PASSWORD,
        name: email.split("@")[0],
        ...extra,
      } as { email: string; password: string; name: string },
      asResponse: true,
    }),
  );
}

export async function userByEmail(email: string) {
  const [row] = await db.select().from(user).where(eq(user.email, email));
  return row;
}

// Real Google flow: sign-in stores the OAuth state and the callback reads it
// back; only the token endpoint is faked.
export async function startGoogleSignIn(
  additionalData?: Record<string, unknown>,
  errorCallbackURL?: string,
) {
  const { headers, response } = await auth.api.signInSocial({
    body: { provider: "google", callbackURL: "/", additionalData, errorCallbackURL },
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

export async function finishGoogleSignIn(
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
