import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function RoundIconButton({
  icon: Icon,
  label,
  text,
  ...props
}: Omit<
  ComponentProps<"button">,
  "children" | "aria-label" | "className" | "type"
> & {
  icon: LucideIcon;
  label: string;
  text?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "flex h-11 cursor-pointer items-center rounded-chip bg-card text-ink shadow-[inset_0_0_0_1px_var(--color-line)] hover-outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50",
        text === undefined
          ? "w-11 justify-center focus-visible:outline-offset-2"
          : "group gap-1.5 pr-3 pl-4 text-sm font-semibold data-[state=open]:shadow-[inset_0_0_0_1px_var(--color-bar-past)]",
      )}
      {...props}
    >
      {text === undefined ? (
        <Icon aria-hidden className="size-[22px]" strokeWidth={1.75} />
      ) : (
        <>
          {text}
          <Icon
            aria-hidden
            className="size-4 group-data-[state=open]:rotate-180"
            strokeWidth={1.75}
          />
        </>
      )}
    </button>
  );
}
