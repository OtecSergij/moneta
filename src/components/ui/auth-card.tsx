import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const AUTH_TITLE_CLASS =
  "text-2xl leading-[30px] font-bold tracking-[-0.02em]";

export const AUTH_SUBTITLE_CLASS = "text-[15px] leading-[22px] text-ink-2";

export function AuthCard({
  title,
  subtitle,
  leading,
  children,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-sheet bg-card px-5 py-6">
      <div className={cn("flex flex-col", leading ? "gap-3" : "gap-1.5")}>
        {leading}
        <h1 className={AUTH_TITLE_CLASS}>{title}</h1>
        {subtitle ? <p className={AUTH_SUBTITLE_CLASS}>{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}
