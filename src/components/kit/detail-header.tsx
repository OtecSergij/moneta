import type { MouseEventHandler, ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function BackLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex h-11 items-center gap-0.5 rounded-control pr-2.5 pl-1 text-base font-medium text-primary-ink hover-ghost focus-visible:outline-2 focus-visible:outline-primary"
    >
      <ChevronLeft aria-hidden className="size-[22px]" strokeWidth={1.75} />
      {children}
    </Link>
  );
}

export function DetailHeader({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between pt-3 pr-2.5 pl-1.5 lg:pt-8 lg:pr-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DetailTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="text-[28px]/[34px] font-bold tracking-[-0.02em] break-words">
      {children}
    </h1>
  );
}
