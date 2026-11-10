"use server";

import { env } from "@/env";
import { requireSpace } from "@/lib/dal";
import { inviteUrl } from "@/lib/invites";
import { createInvite } from "@/repositories/invites";
import { revalidateFor } from "./revalidate";
import type { ActionResult } from "./types";

export async function createInviteAction(): Promise<
  ActionResult<{ url: string }>
> {
  const { user, spaceId } = await requireSpace();
  const invite = await createInvite(spaceId, user.id);
  if (!invite) {
    return { ok: false, error: "Ссылку может создать только владелец" };
  }
  revalidateFor("invite");
  return { ok: true, data: { url: inviteUrl(env.BETTER_AUTH_URL, invite.token) } };
}
