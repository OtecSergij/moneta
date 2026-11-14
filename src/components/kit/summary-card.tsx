import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SummaryCard({
  ariaLabel,
  label,
  className,
  children,
}: {
  ariaLabel: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "flex flex-col gap-1 rounded-card bg-card p-5",
        className,
      )}
    >
      <span className="text-sm text-ink-2">{label}</span>
      {children}
    </section>
  );
}
