import Link from "next/link";
import {
  ChartColumn,
  ListChecks,
  Receipt,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const TABS = [
  { key: "main", href: "/", label: "Траты", Icon: Receipt },
  { key: "history", href: "/history", label: "История", Icon: ChartColumn },
  { key: "lists", href: "/lists", label: "Списки", Icon: ListChecks },
  { key: "accounts", href: "/accounts", label: "Счета", Icon: Wallet },
] as const satisfies readonly {
  key: string;
  href: string;
  label: string;
  Icon: LucideIcon;
}[];

type TabKey = (typeof TABS)[number]["key"];

export type Section = TabKey | "settings" | "none";

export function TabBar({ active }: { active: Section }) {
  return (
    <nav
      aria-label="Разделы"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card px-2 pt-1.5 pb-[max(24px,env(safe-area-inset-bottom))] lg:hidden"
    >
      <div
        className="mx-auto grid max-w-[480px]"
        style={{
          gridTemplateColumns: `repeat(${TABS.length}, minmax(0, 1fr))`,
        }}
      >
        {TABS.map(({ key, href, label, Icon }) => {
          const on = key === active;
          return (
            <Link
              key={key}
              href={href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex min-h-[54px] flex-col items-center justify-center gap-[3px] rounded-control text-[11px] hover-tab focus-visible:outline-2 focus-visible:outline-primary",
                on
                  ? "font-semibold text-primary-ink"
                  : "font-medium text-ink-3",
              )}
            >
              <span
                className={cn(
                  "flex h-[30px] w-14 items-center justify-center rounded-chip",
                  on && "bg-primary-soft",
                )}
              >
                <Icon aria-hidden className="size-[22px]" strokeWidth={1.75} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
