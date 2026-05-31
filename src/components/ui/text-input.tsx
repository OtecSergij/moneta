import {
  forwardRef,
  type CSSProperties,
  type InputHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export const TextInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function TextInput({ className, style, ...props }, ref) {
  const invalid =
    props["aria-invalid"] === true || props["aria-invalid"] === "true";
  const mergedStyle: CSSProperties | undefined = invalid
    ? { borderColor: "var(--danger)", ...style }
    : style;

  return (
    <input
      ref={ref}
      style={mergedStyle}
      className={cn(
        "h-11 w-full rounded-md border border-border bg-surface-raised px-3 text-base text-text",
        "placeholder:text-text-muted transition-colors",
        "focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2",
        invalid
          ? "focus-visible:ring-danger/30"
          : "focus-visible:ring-accent/20",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
});
