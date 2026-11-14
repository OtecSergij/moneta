import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "danger"
  | "danger-text"
  | "tint"
  | "success";

type ButtonSize = "xs" | "sm" | "md" | "lg";

type ButtonLook = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
};

type ButtonProps = ComponentProps<"button"> &
  ButtonLook & {
    loading?: boolean;
  };

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-white hover-primary",
  secondary: "bg-page text-ink hover-soft",
  ghost: "bg-transparent text-ink hover-ghost",
  danger: "bg-danger-soft text-danger-ink hover-danger-soft",
  "danger-text": "bg-transparent text-danger-ink hover-ghost-danger",
  tint: "bg-primary-soft text-primary-ink hover-tint",
  success: "bg-ok text-white",
};

const SEMIBOLD: ReadonlySet<ButtonVariant> = new Set([
  "primary",
  "danger",
  "tint",
  "success",
]);

const DEFAULT_SIZE: Record<ButtonVariant, ButtonSize> = {
  primary: "lg",
  secondary: "md",
  ghost: "md",
  danger: "lg",
  "danger-text": "md",
  tint: "xs",
  success: "xs",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  xs: "h-10 gap-1.5 rounded-[10px] text-sm",
  sm: "h-11 gap-2 rounded-control text-[15px]",
  md: "h-12 gap-2 rounded-field text-[15px]",
  lg: "h-13 gap-2 rounded-field text-base",
};

const ICON_ONLY_CLASS: Record<ButtonSize, string> = {
  xs: "w-10",
  sm: "w-11",
  md: "w-12",
  lg: "w-13",
};

export function buttonClass({
  variant = "primary",
  size = DEFAULT_SIZE[variant],
  iconOnly = false,
}: ButtonLook = {}) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT_CLASS[variant],
    SEMIBOLD.has(variant) || size === "lg" ? "font-semibold" : "font-medium",
    SIZE_CLASS[size],
    iconOnly
      ? ICON_ONLY_CLASS[size]
      : size === "xs"
        ? "pr-3.5 pl-3"
        : size === "sm" && variant !== "ghost"
          ? "px-[18px]"
          : "px-4",
  );
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return (
    <Loader2
      className={cn("animate-spin", className)}
      strokeWidth={1.75}
      aria-hidden
    />
  );
}

export function Button({
  variant,
  size,
  iconOnly,
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
      className={cn(buttonClass({ variant, size, iconOnly }), className)}
      {...props}
    >
      {loading ? (
        <>
          <Spinner />
          <span className="sr-only">{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
