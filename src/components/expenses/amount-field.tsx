import type { ComponentProps } from "react";
import { currencyMeta, type CurrencyCode } from "@/lib/currency";
import { cn } from "@/lib/utils";

type AmountFieldProps = Omit<ComponentProps<"input">, "size"> & {
  size: "main" | "sheet";
  currency: CurrencyCode;
  preview?: string | null;
  error?: string;
};

export function AmountField({
  size,
  currency,
  preview,
  error,
  id = "amount",
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
    <div className={cn("flex flex-col", size === "main" ? "gap-2" : "gap-1.5")}>
      <label
        className={cn(
          "flex cursor-text items-center gap-2.5 rounded-field bg-page",
          size === "main" ? "h-[72px] px-[18px]" : "h-[60px] px-4",
          error
            ? "shadow-[inset_0_0_0_2px_var(--color-error)]"
            : "focus-within:shadow-[inset_0_0_0_2px_var(--color-primary)]",
        )}
      >
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0"
          aria-label="Сумма"
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
                ? "text-[19px]"
                : "text-2xl",
          )}
        >
          {symbol}
        </span>
      </label>
      {preview ? (
        <span id={previewId} className="text-sm text-ink-2 tabular-nums">
          {preview}
        </span>
      ) : null}
      {error ? (
        <p id={errorId} className="text-[13px] text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
