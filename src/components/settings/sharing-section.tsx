import { AvatarInitial } from "@/components/kit/avatar-initial";
import { CardSection } from "@/components/kit/card-section";
import type { SpaceMember } from "@/repositories/spaces";
import { InviteLink } from "./invite-link";

function memberSuffix(isSelf: boolean, isOwner: boolean): string | null {
  if (isSelf && isOwner) return "· вы, владелец";
  if (isSelf) return "· вы";
  if (isOwner) return "· владелец";
  return null;
}

export function SharingSection({
  members,
  currentUserId,
  isOwner,
  inviteUrl,
}: {
  members: SpaceMember[];
  currentUserId: string;
  isOwner: boolean;
  inviteUrl: string | null;
}) {
  return (
    <CardSection
      id="settings-share"
      title="Совместный доступ"
      as="div"
      className="mx-4 mt-5"
    >
      {members.map((member, index) => {
        const suffix = memberSuffix(
          member.userId === currentUserId,
          member.role === "owner",
        );
        return (
          <div
            key={member.userId}
            className="flex min-h-[68px] items-center gap-3 px-4 py-3"
          >
            <AvatarInitial name={member.name} toneIndex={index} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-base leading-tight font-medium">
                {member.name}
                {suffix ? (
                  <span className="text-[13px] font-medium text-ink-2">
                    {" "}
                    {suffix}
                  </span>
                ) : null}
              </span>
              <span className="truncate text-sm leading-tight text-ink-2">
                {member.email}
              </span>
            </span>
          </div>
        );
      })}
      {isOwner ? <InviteLink initialUrl={inviteUrl} /> : null}
    </CardSection>
  );
}
