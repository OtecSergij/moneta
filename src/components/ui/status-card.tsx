import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusCard({
  icon: Icon,
  tone = "accent",
  title,
  children,
}: {
  icon?: LucideIcon;
  tone?: "accent" | "danger";
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 text-center shadow-sm">
      {Icon ? (
        <div
          className={cn(
            "mx-auto flex size-12 items-center justify-center rounded-pill",
            tone === "danger"
              ? "bg-danger/10 text-danger"
              : "bg-accent/10 text-accent"
          )}
        >
          <Icon className="size-6" />
        </div>
      ) : null}
      <h1 className={cn("text-2xl font-semibold text-text", Icon && "mt-4")}>
        {title}
      </h1>
      {children ? (
        <div className="mt-2 text-sm text-text-muted">{children}</div>
      ) : null}
    </div>
  );
}
