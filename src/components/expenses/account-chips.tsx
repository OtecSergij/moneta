"use client";

import type { CurrencyCode } from "@/lib/currency";
import { Chip, ChipGroup } from "@/components/kit/chip";

export type ExpenseAccount = { id: string; name: string; currency: CurrencyCode };

export function AccountChips({
  accounts,
  value,
  onChange,
  legend = "Счёт",
  label,
  error,
  disabled = false,
}: {
  accounts: ExpenseAccount[];
  value: string;
  onChange: (id: string) => void;
  legend?: string;
  label?: string;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <ChipGroup legend={legend} label={label} error={error}>
      <div className="flex flex-wrap gap-2">
        {accounts.map((a) => (
          <Chip
            key={a.id}
            pressed={a.id === value}
            disabled={disabled}
            onClick={() => onChange(a.id)}
          >
            {a.name}
          </Chip>
        ))}
      </div>
    </ChipGroup>
  );
}
