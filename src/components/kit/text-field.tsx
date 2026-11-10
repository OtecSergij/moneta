import { useId, type ComponentProps } from "react";
import { cn } from "@/lib/utils";

type TextFieldProps = Omit<ComponentProps<"input">, "size"> & {
  label: string;
  labelHidden?: boolean;
  variant?: "default" | "title";
  size?: "md" | "lg";
  labelGap?: 6 | 8;
  error?: string;
};

export function TextField({
  label,
  labelHidden = false,
  variant = "default",
  size = "md",
  labelGap = 6,
  error,
  id,
  className,
  "aria-describedby": describedBy,
  ...props
}: TextFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;

  return (
    <div
      className={cn(
        "flex flex-col has-disabled:opacity-60 has-disabled:[&_*]:cursor-not-allowed",
        labelGap === 8 ? "gap-2" : "gap-1.5",
        className,
      )}
    >
      <label
        htmlFor={inputId}
        className={cn(
          "text-[13px] font-medium text-ink-2",
          labelHidden && "sr-only",
        )}
      >
        {label}
      </label>
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-field bg-page",
          size === "lg" ? "h-[52px]" : "h-12",
          variant === "title" ? "px-3.5" : "px-4",
          error
            ? "shadow-[inset_0_0_0_2px_var(--color-error)]"
            : "focus-within:shadow-[inset_0_0_0_2px_var(--color-primary)]",
        )}
      >
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [describedBy, error ? errorId : null].filter(Boolean).join(" ") ||
            undefined
          }
          className={cn(
            "h-full min-w-0 flex-1 bg-transparent text-ink tabular-nums outline-none placeholder:text-ink-3",
            variant === "title"
              ? "text-xl font-semibold"
              : size === "lg"
                ? "text-[17px]"
                : "text-base",
          )}
          {...props}
        />
      </div>
      {error ? (
        <p id={errorId} className="text-[13px] text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
