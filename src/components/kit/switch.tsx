import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type SwitchProps = Omit<ComponentProps<"button">, "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function Switch({
  checked,
  onCheckedChange,
  className,
  ...props
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative h-[31px] w-[51px] flex-none cursor-pointer rounded-chip transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-control-line",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 left-0.5 size-[27px] rounded-chip bg-card shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}
