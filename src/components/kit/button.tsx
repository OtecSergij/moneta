import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "danger-text"
  | "select";

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  iconOnly?: boolean;
  loading?: boolean;
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "h-13 rounded-field bg-primary text-base font-semibold text-white hover:bg-primary-ink",
  secondary:
    "h-12 rounded-field bg-card text-[15px] font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-control-line)] hover:bg-page",
  danger:
    "h-13 rounded-field bg-danger-soft text-base font-semibold text-danger-ink",
  "danger-text":
    "h-12 rounded-field bg-transparent text-[15px] font-medium text-danger-ink",
  select:
    "h-10 rounded-[10px] bg-select text-sm font-semibold text-white",
};

export function Button({
  variant = "primary",
  iconOnly = false,
  loading = false,
  type = "button",
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT_CLASS[variant],
        iconOnly
          ? variant === "select"
            ? "w-10"
            : variant === "secondary"
              ? "w-12"
              : "w-13"
          : variant === "select"
            ? "pr-3.5 pl-3"
            : "px-4",
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-5 animate-spin" strokeWidth={1.75} aria-hidden />
          <span className="sr-only">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
