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
    <div className="flex flex-col gap-5 rounded-sheet bg-card px-5 py-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl leading-[30px] font-bold tracking-[-0.02em]">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-[15px] leading-[22px] text-ink-2">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
