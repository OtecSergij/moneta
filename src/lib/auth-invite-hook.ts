import { APIError, getOAuthState } from "better-auth/api";
import {
  type InviteCtx,
  InviteToken,
  bodyInviteToken,
  extractInviteToken,
} from "@/lib/invites";
import { claimInvite, findActiveInviteByToken } from "@/repositories/invites";

type HookDeps = { readOAuthState: () => Promise<unknown> };

const defaultDeps: HookDeps = { readOAuthState: getOAuthState };

async function isActiveToken(value: unknown): Promise<boolean> {
  if (typeof value !== "string" || !InviteToken.safeParse(value).success) {
    return false;
  }
  return (await findActiveInviteByToken(value)) !== null;
}

// Runs before the endpoint looks the email up, so the reply for an invalid
// invite is the same for new and existing addresses. Accepted residual risk
// (docs/auth-decisions.md, "Data isolation"): a holder of an active link can
// probe whether an email is taken, because a new email burns the link and an
// existing one leaves it active.
export async function inviteGuard(ctx: {
  path?: string;
  body?: unknown;
}): Promise<void> {
  const token = bodyInviteToken(ctx);
  if (!token.present) return;
  if (await isActiveToken(token.value)) return;
  console.info("invite.rejected_inactive", { path: ctx.path });
  throw new APIError("BAD_REQUEST", {
    code: "INVITE_INVALID",
    message: "Invite is not valid",
  });
}

export async function beforeUserCreate(
  _user: { id?: string },
  ctx: InviteCtx,
  deps: HookDeps = defaultDeps,
): Promise<boolean | void> {
  const extracted = await extractInviteToken(ctx, deps.readOAuthState);
  if (extracted.kind === "none") return;
  if (
    extracted.kind === "token" &&
    (await findActiveInviteByToken(extracted.token))
  ) {
    return;
  }
  console.info("invite.rejected_inactive", { stage: "user.create.before" });
  return false;
}

export async function afterUserCreate(
  user: { id: string },
  ctx: InviteCtx,
  deps: HookDeps = defaultDeps,
): Promise<void> {
  try {
    const extracted = await extractInviteToken(ctx, deps.readOAuthState);
    if (extracted.kind !== "token") return;
    await claimInvite(user.id, extracted.token);
  } catch {
    // The driver error message carries query params (the token), so it stays out of the log.
    console.error("invite.claim_failed", { userId: user.id });
  }
}
