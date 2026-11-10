"use client";

import type { CurrencyCode } from "@/lib/currency";
import { Chip } from "@/components/kit/chip";

export type ExpenseAccount = { id: string; name: string; currency: CurrencyCode };

export function AccountChips({
  accounts,
  value,
  onChange,
}: {
  accounts: ExpenseAccount[];
  value: string | null;
  onChange: (id: string | null) => void;
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
        <Chip pressed={value === null} onClick={() => onChange(null)}>
          Без счёта
        </Chip>
      </div>
    </fieldset>
  );
}
