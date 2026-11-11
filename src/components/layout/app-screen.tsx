import type { ReactNode } from "react";
import { TabBar, type Section } from "@/components/nav/tab-bar";
import { SideNav } from "@/components/nav/side-nav";
import { TimeZoneCookie } from "@/components/layout/time-zone-cookie";

export function AppScreen({
  tab,
  children,
}: {
  tab: Section;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-page text-ink lg:pl-[248px]">
      <SideNav active={tab} />
      <main className="mx-auto flex w-full max-w-[480px] flex-col pb-[calc(61px+max(24px,env(safe-area-inset-bottom)))] lg:max-w-[640px] lg:pb-10">
        {children}
      </main>
      <TabBar active={tab} />
      <TimeZoneCookie />
    </div>
  );
}
