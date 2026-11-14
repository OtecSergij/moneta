import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const FIELD_LABEL_CLASS = "text-[13px] font-medium text-ink-2";

export function FieldError({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <p id={id} role="alert" className={cn("text-[13px] text-error", className)}>
      {children}
    </p>
  );
}

const FRAME_SIZE = {
  sm: "h-11 rounded-control",
  md: "h-12 rounded-field",
  lg: "h-[52px] rounded-field",
  xl: "h-[60px] rounded-field",
  "2xl": "h-[72px] rounded-field",
} as const;

const FRAME_PAD = { 14: "px-3.5", 16: "px-4", 18: "px-[18px]" } as const;

export function FieldFrame({
  as: Tag = "div",
  size,
  pad,
  tone = "page",
  error = false,
  children,
}: {
  as?: "div" | "label";
  size: keyof typeof FRAME_SIZE;
  pad: keyof typeof FRAME_PAD;
  tone?: "page" | "card";
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        "flex items-center gap-2.5",
        Tag === "label" && "cursor-text",
        FRAME_SIZE[size],
        FRAME_PAD[pad],
        tone === "card" ? "bg-card" : "bg-page",
        error
          ? "shadow-[inset_0_0_0_2px_var(--color-error)]"
          : "focus-within:shadow-[inset_0_0_0_2px_var(--color-primary)]",
      )}
    >
      {children}
    </Tag>
  );
}

type TextFieldProps = Omit<ComponentProps<"input">, "size"> & {
  label: string;
  labelHidden?: boolean;
  variant?: "default" | "title" | "heading" | "frameless";
  size?: "sm" | "md" | "lg";
  tone?: "page" | "card";
  labelGap?: 6 | 8;
  error?: string;
};

export function TextField({
  label,
  labelHidden = false,
  variant = "default",
  size = "md",
  tone = "page",
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

  const input = (
    <input
      id={inputId}
      aria-invalid={error ? true : undefined}
      aria-describedby={
        [describedBy, error ? errorId : null].filter(Boolean).join(" ") ||
        undefined
      }
      className={cn(
        "h-full min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink-3",
        variant !== "frameless" && "tabular-nums",
        variant === "heading"
          ? "text-2xl font-bold tracking-[-0.02em]"
          : variant === "title"
            ? "text-xl font-semibold"
            : size === "lg"
              ? "text-[17px]"
              : "text-base",
      )}
      {...props}
    />
  );

  return (
    <div
      className={cn(
        "flex flex-col has-disabled:opacity-50 has-disabled:[&_*]:cursor-not-allowed",
        labelGap === 8 ? "gap-2" : "gap-1.5",
        className,
      )}
    >
      <label
        htmlFor={inputId}
        className={cn(FIELD_LABEL_CLASS, labelHidden && "sr-only")}
      >
        {label}
      </label>
      {variant === "frameless" ? (
        <div className="flex h-11 items-center">{input}</div>
      ) : (
        <FieldFrame
          size={size}
          pad={variant === "default" && size !== "sm" ? 16 : 14}
          tone={tone}
          error={Boolean(error)}
        >
          {input}
        </FieldFrame>
      )}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
