import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function AuthLink({
  href,
  disabled,
  className,
  children,
}: {
  href: string;
  disabled: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      className={cn(
        "font-medium text-primary-ink hover:text-primary",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      {children}
    </Link>
  );
}
