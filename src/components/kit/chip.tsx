import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FIELD_LABEL_CLASS, FieldError } from "@/components/kit/text-field";

type ChipProps = ComponentProps<"button"> & {
  variant?: "solid" | "dashed";
  pressed?: boolean;
  dotColor?: string;
  icon?: ReactNode;
  wide?: boolean;
};

const DASHED_CLASS =
  "border border-dashed border-bar-past bg-card text-ink aria-expanded:border-primary aria-expanded:text-primary-ink";

export function Chip({
  variant = "solid",
  pressed,
  dotColor,
  icon,
  wide = false,
  type = "button",
  className,
  children,
  ...props
}: ChipProps) {
  const dashed = variant === "dashed";
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(
        "inline-flex h-10 cursor-pointer items-center rounded-chip text-sm font-medium",
        dashed ? "hover-white" : "hover-chip",
        wide ? "pr-4" : "pr-3.5",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "disabled:cursor-not-allowed",
        dashed
          ? DASHED_CLASS
          : pressed
            ? "bg-primary-soft text-primary-ink"
            : "bg-page text-ink",
        dotColor
          ? "gap-[7px] pl-3"
          : icon
            ? dashed
              ? "gap-1.5 pl-2.5"
              : "gap-1.5 pl-3"
            : wide
              ? "pl-4"
              : "pl-3.5",
        className,
      )}
      {...props}
    >
      {dotColor ? (
        <span
          aria-hidden
          className="size-[9px] flex-none rounded-chip"
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

export function ChipGroup({
  legend,
  label,
  error,
  className,
  children,
}: {
  legend: string;
  label?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  const errorId = useId();
  return (
    <div
      role="group"
      aria-label={legend}
      aria-describedby={error ? errorId : undefined}
      className={className}
    >
      {label ? (
        <div className="flex flex-col gap-1.5">
          <span aria-hidden className={FIELD_LABEL_CLASS}>
            {label}
          </span>
          {children}
        </div>
      ) : (
        children
      )}
      {error ? (
        <FieldError id={errorId} className="mt-1.5">
          {error}
        </FieldError>
      ) : null}
    </div>
  );
}
