"use client";

import { useState } from "react";
import type { CurrencyCode } from "@/lib/currency";
import { formatMoney } from "@/lib/money";
import type { AccountSummaryRow } from "@/lib/accounts-total";
import { AccountSheet } from "@/components/accounts/account-sheet";
import { accountToneClass } from "@/components/accounts/tones";
import { cn } from "@/lib/utils";

export function AccountRows({
  rows,
  displayCurrency,
}: {
  rows: AccountSummaryRow[];
  displayCurrency: CurrencyCode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((row) => row.id === openId) ?? null;

  return (
    <>
      <ul className="mx-4 mt-3 overflow-hidden rounded-card bg-card">
        {rows.map((row, i) => (
          <li key={row.id} className={cn(i > 0 && "border-t border-row-line")}>
            <button
              type="button"
              onClick={() => setOpenId(row.id)}
              className="flex min-h-[72px] w-full cursor-pointer items-center gap-3.5 px-4 py-3 text-left text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2 text-base font-semibold">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2.5 flex-none rounded-chip",
                      accountToneClass(row.toneIndex),
                    )}
                  />
                  <span className="min-w-0 truncate">{row.name}</span>
                </span>
                {row.currency === displayCurrency ? null : row.convertedMinor === null ? (
                  <span className="pl-[18px] text-[13px] text-ink-3">Нет курса</span>
                ) : (
                  <span className="pl-[18px] text-[13px] text-ink-2 tabular-nums">
                    ≈ {formatMoney(row.convertedMinor, displayCurrency)}
                  </span>
                )}
              </span>
              <span className="text-[17px] font-semibold whitespace-nowrap tabular-nums">
                {formatMoney(row.balanceMinor, row.currency)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open ? (
        <AccountSheet
          key={open.id}
          account={open}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}
