import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hasGoogleOAuth } from "@/env";
import { getSession } from "@/lib/dal";
import { InviteToken, decideInvitePage } from "@/lib/invites";
import { findActiveInviteByToken } from "@/repositories/invites";
import { AuthShell } from "@/components/layout/auth-shell";
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
    <AuthShell>
      {decision === "form" && invite ? (
        <InviteForm
          token={token}
          ownerName={invite.ownerName}
          hasGoogle={hasGoogleOAuth}
          googleError={typeof query.error === "string" ? query.error : undefined}
        />
      ) : (
        <InviteInvalid />
      )}
    </AuthShell>
  );
}
