"use client";

import type { CurrencyCode } from "@/lib/currency";
import { Chip } from "@/components/kit/chip";

export type ExpenseAccount = { id: string; name: string; currency: CurrencyCode };

export function AccountChips({
  accounts,
  value,
  onChange,
  error,
}: {
  accounts: ExpenseAccount[];
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="sr-only">Счёт</legend>
      <div className="flex flex-wrap gap-2">
        {accounts.map((a) => (
          <Chip key={a.id} pressed={a.id === value} onClick={() => onChange(a.id)}>
            {a.name}
          </Chip>
        ))}
      </div>
      {error ? (
        <p className="mt-1.5 text-[13px] text-error" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
