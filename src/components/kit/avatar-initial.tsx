import { avatarInitial, avatarTone } from "@/lib/avatar";
import { cn } from "@/lib/utils";

type AvatarInitialProps = {
  name: string;
  toneIndex: number;
  size?: "md" | "lg";
  className?: string;
};

export function AvatarInitial({
  name,
  toneIndex,
  size = "md",
  className,
}: AvatarInitialProps) {
  const tone = avatarTone(toneIndex);
  return (
    <span
      aria-hidden
      className={cn(
        "flex flex-none items-center justify-center rounded-chip font-semibold",
        size === "lg" ? "size-13 text-[22px]" : "size-10 text-base",
        className,
      )}
      style={{ background: tone.bg, color: tone.fg }}
    >
      {avatarInitial(name)}
    </span>
  );
}
