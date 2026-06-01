import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    loading = false,
    disabled,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-md px-4 text-base font-medium",
        "cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-accent text-white hover:bg-accent-hover focus-visible:ring-accent/40",
        variant === "secondary" &&
          "border border-border bg-transparent text-text hover:bg-surface focus-visible:ring-accent/30",
        variant === "danger" &&
          "bg-danger text-white hover:bg-danger-hover focus-visible:ring-danger/40",
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
});
