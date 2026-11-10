import { describe, expect, it } from "vitest";
import {
  InviteToken,
  decideInvitePage,
  displayInviteUrl,
  extractInviteToken,
  generateInviteToken,
  inviteUrl,
} from "@/lib/invites";

const TOKEN = "AbCdEfGhIjKlMnOpQr_-12";
const noState = async () => null;

describe("InviteToken", () => {
  it("accepts 22 base64url characters", () => {
    expect(InviteToken.safeParse(TOKEN).success).toBe(true);
  });

  it.each([
    ["too short", TOKEN.slice(1)],
    ["too long", `${TOKEN}a`],
    ["non-base64url character", `${TOKEN.slice(1)}+`],
    ["empty", ""],
  ])("rejects %s", (_label, value) => {
    expect(InviteToken.safeParse(value).success).toBe(false);
  });

  it("matches what generateInviteToken produces", () => {
    for (let i = 0; i < 50; i++) {
      expect(InviteToken.safeParse(generateInviteToken()).success).toBe(true);
    }
  });
});

describe("inviteUrl / displayInviteUrl", () => {
  it("builds the invite path off the base url", () => {
    expect(inviteUrl("https://moneta.example/", TOKEN)).toBe(
      `https://moneta.example/invite/${TOKEN}`,
    );
  });

  it("drops the protocol for display", () => {
    expect(displayInviteUrl(`https://moneta.example/invite/${TOKEN}`)).toBe(
      `moneta.example/invite/${TOKEN}`,
    );
    expect(displayInviteUrl("http://localhost:3000/invite/x")).toBe(
      "localhost:3000/invite/x",
    );
  });
});

describe("extractInviteToken", () => {
  const SIGN_UP = "/sign-up/email";
  const SOCIAL = "/sign-in/social";

  it("reads the token from the body", async () => {
    expect(
      await extractInviteToken(
        { path: SIGN_UP, body: { inviteToken: TOKEN } },
        noState,
      ),
    ).toEqual({ kind: "token", token: TOKEN });
    expect(
      await extractInviteToken(
        { path: SOCIAL, body: { additionalData: { inviteToken: TOKEN } } },
        noState,
      ),
    ).toEqual({ kind: "token", token: TOKEN });
  });

  it("ignores a token outside the place its path accepts", async () => {
    const stateToken = async () => ({ inviteToken: TOKEN });
    expect(
      await extractInviteToken(
        { path: SIGN_UP, body: { additionalData: { inviteToken: TOKEN } } },
        stateToken,
      ),
    ).toEqual({ kind: "none" });
    expect(
      await extractInviteToken(
        { path: SOCIAL, body: { inviteToken: TOKEN } },
        stateToken,
      ),
    ).toEqual({ kind: "none" });
    expect(
      await extractInviteToken(
        { path: "/callback/:id", body: { inviteToken: "nope" } },
        stateToken,
      ),
    ).toEqual({ kind: "token", token: TOKEN });
  });

  it("reads the token from the OAuth state when the body has none", async () => {
    expect(
      await extractInviteToken({}, async () => ({ inviteToken: TOKEN })),
    ).toEqual({ kind: "token", token: TOKEN });
    expect(
      await extractInviteToken(null, async () => ({ inviteToken: TOKEN })),
    ).toEqual({ kind: "token", token: TOKEN });
  });

  it("returns none when neither carries a token", async () => {
    expect(
      await extractInviteToken(
        { path: SIGN_UP, body: { email: "a@b.c" } },
        noState,
      ),
    ).toEqual({ kind: "none" });
  });

  it("returns invalid for a malformed token", async () => {
    expect(
      await extractInviteToken(
        { path: SIGN_UP, body: { inviteToken: "nope" } },
        noState,
      ),
    ).toEqual({ kind: "invalid" });
    expect(
      await extractInviteToken(
        { path: SIGN_UP, body: { inviteToken: 42 } },
        noState,
      ),
    ).toEqual({ kind: "invalid" });
    expect(
      await extractInviteToken({}, async () => ({ inviteToken: "" })),
    ).toEqual({ kind: "invalid" });
  });

  it("returns none when the state getter throws", async () => {
    expect(
      await extractInviteToken({}, async () => {
        throw new Error("no request state");
      }),
    ).toEqual({ kind: "none" });
  });
});

describe("decideInvitePage", () => {
  const invite = { ownerName: "Анна" };

  it("redirects a signed-in user whatever the token", () => {
    expect(
      decideInvitePage({
        hasSession: true,
        tokenFormatOk: false,
        invite: null,
      }),
    ).toBe("redirect");
    expect(
      decideInvitePage({ hasSession: true, tokenFormatOk: true, invite }),
    ).toBe("redirect");
  });

  it("is invalid for a malformed token", () => {
    expect(
      decideInvitePage({ hasSession: false, tokenFormatOk: false, invite }),
    ).toBe("invalid");
  });

  it("is invalid when no active invite was found", () => {
    expect(
      decideInvitePage({
        hasSession: false,
        tokenFormatOk: true,
        invite: null,
      }),
    ).toBe("invalid");
  });

  it("shows the form otherwise", () => {
    expect(
      decideInvitePage({ hasSession: false, tokenFormatOk: true, invite }),
    ).toBe("form");
  });
});
