import type { ReactNode } from "react";
import { TabBar, type TabKey } from "@/components/nav/tab-bar";
import { TimeZoneCookie } from "@/components/layout/time-zone-cookie";

export function AppScreen({
  tab,
  children,
}: {
  tab: TabKey | "none";
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-page text-ink">
      <main className="mx-auto flex w-full max-w-[480px] flex-col pb-[calc(61px+max(24px,env(safe-area-inset-bottom)))]">
        {children}
      </main>
      <TabBar active={tab} />
      <TimeZoneCookie />
    </div>
  );
}
