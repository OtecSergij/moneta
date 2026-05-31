import type { ReactNode } from "react";

export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-text">{title}</h1>
      {subtitle ? (
        <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
      ) : null}
      {children}
    </div>
  );
}
