import type { Metadata } from "next";
import { env } from "@/env";
import { requireSpace } from "@/lib/dal";
import { inviteUrl } from "@/lib/invites";
import { getActiveInviteForOwner } from "@/repositories/invites";
import { listMembers } from "@/repositories/spaces";
import { AppScreen } from "@/components/layout/app-screen";
import { ScreenHeader } from "@/components/layout/screen-header";
import { CardSection } from "@/components/kit/card-section";
import { DetailHeader } from "@/components/kit/detail-header";
import { LogoutButton } from "@/components/logout-button";
import { BackButton } from "@/components/settings/back-button";
import { SharingSection } from "@/components/settings/sharing-section";

export const metadata: Metadata = { title: "Настройки — moneta" };

export default async function SettingsPage() {
  const { user, spaceId, role } = await requireSpace();
  const isOwner = role === "owner";
  const [members, invite] = await Promise.all([
    listMembers(spaceId),
    isOwner ? getActiveInviteForOwner(spaceId, user.id) : null,
  ]);

  return (
    <AppScreen tab="settings">
      <DetailHeader className="lg:hidden">
        <BackButton />
      </DetailHeader>
      <ScreenHeader title="Настройки" showSettings={false} belowBack />

      <SharingSection
        members={members}
        currentUserId={user.id}
        isOwner={isOwner}
        inviteUrl={
          invite ? inviteUrl(env.BETTER_AUTH_URL, invite.token) : null
        }
      />

      <CardSection
        id="settings-account"
        title="Аккаунт"
        as="div"
        className="mx-4 mt-7"
      >
        <div className="flex min-h-14 items-center justify-between gap-3 px-4">
          <span className="text-base">Email</span>
          <span className="min-w-0 truncate text-[15px] text-ink-2">
            {user.email}
          </span>
        </div>
        <LogoutButton />
      </CardSection>
    </AppScreen>
  );
}
