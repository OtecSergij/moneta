import Link from "next/link";
import { Settings, type LucideIcon } from "lucide-react";
import { TABS, type Section } from "@/components/nav/tab-bar";
import { Logo } from "@/components/layout/logo";
import { cn } from "@/lib/utils";

function SideLink({
  href,
  label,
  Icon,
  current,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  current: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-3 rounded-control px-3 text-[15px] hover-side focus-visible:outline-2 focus-visible:outline-primary",
        current
          ? "bg-primary-soft font-semibold text-primary-ink"
          : "font-medium text-ink-2",
      )}
    >
      <Icon aria-hidden className="size-[22px]" strokeWidth={1.75} />
      {label}
    </Link>
  );
}

export function SideNav({ active }: { active: Section }) {
  return (
    <nav
      aria-label="Разделы"
      className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col gap-1 border-r border-line bg-card px-4 pt-7 pb-6 lg:flex"
    >
      <Logo className="px-3 pb-5" />
      {TABS.map(({ key, href, label, Icon }) => (
        <SideLink
          key={key}
          href={href}
          label={label}
          Icon={Icon}
          current={key === active}
        />
      ))}
      <div className="mt-auto flex flex-col">
        <SideLink
          href="/settings"
          label="Настройки"
          Icon={Settings}
          current={active === "settings"}
        />
      </div>
    </nav>
  );
}
