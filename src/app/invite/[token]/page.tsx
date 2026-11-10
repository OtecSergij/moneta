import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasGoogleOAuth } from "@/env";
import { getSession } from "@/lib/dal";
import { InviteToken, decideInvitePage } from "@/lib/invites";
import { findActiveInviteByToken } from "@/repositories/invites";
import { InviteForm } from "./invite-form";
import { InviteInvalid } from "./invite-invalid";

export const metadata: Metadata = { title: "Приглашение — moneta" };

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ token }, query, session] = await Promise.all([
    params,
    searchParams,
    getSession(),
  ]);

  const tokenFormatOk = InviteToken.safeParse(token).success;
  const invite =
    session || !tokenFormatOk ? null : await findActiveInviteByToken(token);

  const decision = decideInvitePage({
    hasSession: Boolean(session),
    tokenFormatOk,
    invite,
  });

  if (decision === "redirect") redirect("/");

  return (
    <div className="flex-1 bg-page">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-5 pb-8 text-ink">
        <span className="px-1 text-[22px] leading-[normal] font-bold tracking-[-0.03em]">
          moneta
        </span>
        {decision === "form" && invite ? (
          <InviteForm
            token={token}
            ownerName={invite.ownerName}
            hasGoogle={hasGoogleOAuth}
            error={Boolean(query.error)}
          />
        ) : (
          <InviteInvalid />
        )}
      </div>
    </div>
  );
}
