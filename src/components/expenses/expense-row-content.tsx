import type { ReactNode } from "react";
import type { ExpenseWithConversion } from "@/repositories/expenses";
import { ExpenseAmount } from "@/components/expenses/expense-amount";

export function ExpenseRowContent({
  expense,
  color,
  title,
  when,
  subtitle,
}: {
  expense: ExpenseWithConversion;
  color?: string;
  title: string;
  when?: string;
  subtitle?: ReactNode;
}) {
  const hasMeta = Boolean(when || color || subtitle);
  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[15px]/[18px] font-medium text-ink">
          {title}
        </span>
        {hasMeta ? (
          <span className="flex min-w-0 items-center gap-1.5 text-[13px]/[16px] text-ink-2">
            {when ? <span className="flex-none">{when}</span> : null}
            {when && (color || subtitle) ? <span aria-hidden>·</span> : null}
            {color ? (
              <span
                aria-hidden
                className="size-2 flex-none rounded-chip"
                style={{ background: color }}
              />
            ) : null}
            {subtitle ? <span className="truncate">{subtitle}</span> : null}
          </span>
        ) : null}
      </span>
      <ExpenseAmount
        expense={expense}
        className="flex-none text-[15px] font-medium whitespace-nowrap text-ink"
      />
    </>
  );
}
