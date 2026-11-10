import type { ComponentProps } from "react";
import type { CurrencyCode } from "@/lib/currency";
import { AmountField } from "@/components/expenses/amount-field";

export function BalanceField({
  id,
  currency,
  error,
  ...props
}: Omit<ComponentProps<"input">, "size" | "id"> & {
  id: string;
  currency: CurrencyCode;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        Остаток
      </label>
      <AmountField
        id={id}
        size="sheet"
        currency={currency}
        error={error}
        aria-label="Остаток"
        {...props}
      />
    </div>
  );
}
