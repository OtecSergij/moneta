import { z } from "zod";

export const INVITE_TTL_DAYS = 7;

export const InviteToken = z.string().regex(/^[A-Za-z0-9_-]{22}$/);

// Web Crypto instead of node:crypto so the module stays importable from client
// components; output matches randomBytes(16).toString("base64url").
export function generateInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function inviteUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/invite/${token}`;
}

export function displayInviteUrl(url: string): string {
  return url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
}

type ExtractedInviteToken =
  { kind: "none" } | { kind: "invalid" } | { kind: "token"; token: string };

function classify(value: unknown): ExtractedInviteToken {
  const parsed = InviteToken.safeParse(value);
  return parsed.success
    ? { kind: "token", token: parsed.data }
    : { kind: "invalid" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type InviteCtx = { path?: string; body?: unknown } | null;

// The only places a token is accepted: top-level on email sign-up, in
// additionalData on social sign-in, and in the OAuth state on the callback.
export function bodyInviteToken(
  ctx: InviteCtx,
): { present: false } | { present: true; value: unknown } {
  const body = ctx?.body;
  if (!isRecord(body)) return { present: false };
  if (ctx?.path === "/sign-up/email" && "inviteToken" in body) {
    return { present: true, value: body.inviteToken };
  }
  if (ctx?.path === "/sign-in/social") {
    const extra = body.additionalData;
    if (isRecord(extra) && "inviteToken" in extra) {
      return { present: true, value: extra.inviteToken };
    }
  }
  return { present: false };
}

export async function extractInviteToken(
  ctx: InviteCtx,
  readOAuthState: () => Promise<unknown>,
): Promise<ExtractedInviteToken> {
  if (ctx?.path === "/sign-up/email" || ctx?.path === "/sign-in/social") {
    const fromBody = bodyInviteToken(ctx);
    return fromBody.present ? classify(fromBody.value) : { kind: "none" };
  }

  let state: unknown;
  try {
    state = await readOAuthState();
  } catch {
    return { kind: "none" };
  }
  if (isRecord(state) && "inviteToken" in state) {
    return classify(state.inviteToken);
  }
  return { kind: "none" };
}

export function decideInvitePage(input: {
  hasSession: boolean;
  tokenFormatOk: boolean;
  invite: { ownerName: string } | null;
}): "redirect" | "invalid" | "form" {
  if (input.hasSession) return "redirect";
  if (!input.tokenFormatOk || !input.invite) return "invalid";
  return "form";
}
