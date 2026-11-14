import type { ComponentProps } from "react";
import { currencyMeta, type CurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  FIELD_LABEL_CLASS,
  FieldError,
  FieldFrame,
} from "@/components/kit/text-field";

type AmountFieldProps = Omit<ComponentProps<"input">, "size"> & {
  size: "main" | "sheet";
  currency: CurrencyCode;
  label?: string;
  preview?: string | null;
  error?: string;
};

export function AmountField({
  size,
  currency,
  label,
  preview,
  error,
  id = "amount",
  className,
  ...props
}: AmountFieldProps) {
  const symbol = currencyMeta(currency).symbol;
  const long = symbol.length > 1;
  const previewId = `${id}-conv`;
  const errorId = `${id}-error`;
  const describedBy =
    [preview ? previewId : null, error ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div
      className={cn(
        "flex flex-col has-disabled:opacity-50 has-disabled:[&_*]:cursor-not-allowed",
        size === "main" ? "gap-2" : "gap-1.5",
        className,
      )}
    >
      {label ? (
        <label htmlFor={id} className={FIELD_LABEL_CLASS}>
          {label}
        </label>
      ) : null}
      <FieldFrame
        as="label"
        size={size === "main" ? "2xl" : "xl"}
        pad={size === "main" ? 18 : 16}
        error={Boolean(error)}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          aria-label={label ?? "Сумма"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "max-w-full min-w-[1ch] bg-transparent p-0 font-medium tracking-[-0.02em] text-ink tabular-nums outline-none field-sizing-content placeholder:text-ink-3",
            size === "main" ? "h-14 text-[36px]" : "h-12 text-[30px]",
          )}
          {...props}
        />
        <span
          className={cn(
            "flex-none text-ink-2",
            size === "main"
              ? long
                ? "text-[22px]"
                : "text-[28px]"
              : long
                ? "text-[18px]"
                : "text-2xl",
          )}
        >
          {symbol}
        </span>
      </FieldFrame>
      {preview ? (
        <span id={previewId} className="text-sm text-ink-2 tabular-nums">
          {preview}
        </span>
      ) : null}
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
