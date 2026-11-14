import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/kit/button";
import { AUTH_SUBTITLE_CLASS, AUTH_TITLE_CLASS } from "@/components/ui/auth-card";

const TONES = {
  accent: "bg-primary-soft text-primary-ink",
  danger: "bg-danger-soft text-danger-ink",
  warn: "bg-warn-soft text-warn-ink",
} as const;

export function StatusCard({
  icon: Icon,
  tone = "accent",
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  title: string;
  children?: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="mt-24 flex flex-col items-center gap-3.5 rounded-sheet bg-card px-6 py-8 text-center">
      {Icon ? (
        <span
          aria-hidden
          className={cn(
            "flex size-16 items-center justify-center rounded-chip",
            TONES[tone],
          )}
        >
          <Icon className="size-[30px]" strokeWidth={1.75} />
        </span>
      ) : null}
      <h1 className={cn(AUTH_TITLE_CLASS, Icon && "mt-1")}>{title}</h1>
      {children ? <p className={AUTH_SUBTITLE_CLASS}>{children}</p> : null}
      {action ? (
        <Link
          href={action.href}
          className={cn(
            buttonClass({ variant: "secondary", size: "lg" }),
            "mt-2.5 self-stretch",
          )}
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
