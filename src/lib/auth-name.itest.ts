import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { PASSWORD, asReply, newEmail, signUpWith, userByEmail } from "@/test/auth-api";

vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => {}) }));

const BLANK_NAMES = ["", "   ", "\t\n", "\u200b", " \u2060\ufeff\u200d "];

async function signedIn() {
  const email = newEmail();
  expect((await signUpWith(email)).status).toBe(200);
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, email));
  const res = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    asResponse: true,
  });
  expect(res.status).toBe(200);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return { email, headers: new Headers({ cookie }) };
}

function renameTo(name: unknown, headers: Headers) {
  return asReply(() =>
    auth.api.updateUser({ body: { name } as { name?: string }, headers, asResponse: true }),
  );
}

describe("name on /sign-up/email", () => {
  it("an empty or blank name gets 400 and creates no user", async () => {
    for (const name of BLANK_NAMES) {
      const email = newEmail();
      expect(await signUpWith(email, { name }), JSON.stringify(name)).toMatchObject({
        status: 400,
        body: { message: "Name is required" },
      });
      expect(await userByEmail(email)).toBeUndefined();
    }
  });

  it("a name with text around spaces is accepted", async () => {
    const email = newEmail();
    expect((await signUpWith(email, { name: " Аня " })).status).toBe(200);
    expect(await userByEmail(email)).toBeDefined();
  });
});

describe("name on /update-user", () => {
  it("an empty or blank name gets 400 and keeps the stored name; a real one is saved", async () => {
    const { email, headers } = await signedIn();
    const stored = (await userByEmail(email)).name;

    for (const name of BLANK_NAMES) {
      expect(await renameTo(name, headers), JSON.stringify(name)).toMatchObject({
        status: 400,
        body: { message: "Name is required" },
      });
    }
    expect((await userByEmail(email)).name).toBe(stored);

    expect((await renameTo("Аня", headers)).status).toBe(200);
    expect((await userByEmail(email)).name).toBe("Аня");
  });

  it("a name that is null gets 400 and keeps the stored name", async () => {
    const { email, headers } = await signedIn();
    const stored = (await userByEmail(email)).name;

    expect(await renameTo(null, headers)).toMatchObject({
      status: 400,
      body: { message: "Name is required" },
    });
    expect((await userByEmail(email)).name).toBe(stored);
  });
});
