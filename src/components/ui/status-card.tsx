import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusCard({
  icon: Icon,
  tone = "accent",
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  tone?: "accent" | "danger";
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
            tone === "danger"
              ? "bg-danger-soft text-danger-ink"
              : "bg-primary-soft text-primary-ink",
          )}
        >
          <Icon className="size-[30px]" strokeWidth={1.75} />
        </span>
      ) : null}
      <h1
        className={cn(
          "text-2xl leading-[30px] font-bold tracking-[-0.02em]",
          Icon && "mt-1",
        )}
      >
        {title}
      </h1>
      {children ? (
        <p className="text-[15px] leading-[22px] text-ink-2">{children}</p>
      ) : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-2.5 flex h-13 items-center justify-center self-stretch rounded-field bg-page text-base font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
