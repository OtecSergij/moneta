import type { ReactNode } from "react";
import { Logo } from "@/components/layout/logo";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 bg-page">
      <div className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-5 px-4 pt-5 pb-8 text-ink">
        <Logo className="px-1" />
        <main>{children}</main>
      </div>
    </div>
  );
}
