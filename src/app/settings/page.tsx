import type { Metadata } from "next";
import { env } from "@/env";
import { requireSpace } from "@/lib/dal";
import { inviteUrl } from "@/lib/invites";
import { getActiveInviteForOwner } from "@/repositories/invites";
import { listMembers } from "@/repositories/spaces";
import { AppScreen } from "@/components/layout/app-screen";
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
    <AppScreen tab="none">
      <div className="pt-3 pr-2.5 pl-1.5">
        <BackButton />
      </div>
      <h1 className="mx-5 mt-1 text-[28px] leading-9 font-bold tracking-[-0.02em]">
        Настройки
      </h1>

      <SharingSection
        members={members}
        currentUserId={user.id}
        isOwner={isOwner}
        inviteUrl={
          invite ? inviteUrl(env.BETTER_AUTH_URL, invite.token) : null
        }
      />

      <section
        aria-labelledby="settings-account"
        className="mx-4 mt-7 flex flex-col gap-2"
      >
        <h2 id="settings-account" className="mx-1 text-[17px] font-semibold">
          Аккаунт
        </h2>
        <div className="overflow-hidden rounded-card bg-card">
          <div className="flex min-h-14 items-center justify-between gap-3 px-4">
            <span className="text-base">Email</span>
            <span className="min-w-0 truncate text-[15px] text-ink-2">
              {user.email}
            </span>
          </div>
          <LogoutButton />
        </div>
      </section>
    </AppScreen>
  );
}
