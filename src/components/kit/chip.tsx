import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ChipProps = ComponentProps<"button"> & {
  pressed: boolean;
  dotColor?: string;
  icon?: ReactNode;
  wide?: boolean;
};

export function Chip({
  pressed,
  dotColor,
  icon,
  wide = false,
  type = "button",
  className,
  children,
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-10 cursor-pointer items-center rounded-chip text-sm font-medium hover-chip",
        wide ? "pr-4" : "pr-3.5",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-60",
        pressed ? "bg-select text-white" : "bg-page text-ink",
        dotColor ? "gap-[7px] pl-3" : icon ? "gap-1.5 pl-3" : wide ? "pl-4" : "pl-3.5",
        className,
      )}
      {...props}
    >
      {dotColor ? (
        <span
          aria-hidden
          className={cn(
            "size-[9px] flex-none rounded-chip",
            pressed && "shadow-[0_0_0_2px_var(--color-card)]",
          )}
          style={{ background: dotColor }}
        />
      ) : icon ? (
        <span aria-hidden className="flex flex-none">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
