import type { CurrencyCode } from "@/lib/currency";
import type { AccountSummaryRow } from "@/lib/accounts-total";
import { RowGroup } from "@/components/kit/row-group";
import { ListRow } from "@/components/kit/list-row";
import { Money } from "@/components/ui/money";
import { Approx } from "@/components/ui/approx";

export function AccountRows({
  rows,
  displayCurrency,
}: {
  rows: AccountSummaryRow[];
  displayCurrency: CurrencyCode;
}) {
  return (
    <RowGroup className="mx-4 mt-3">
      {rows.map((row) => (
        <ListRow key={row.id} href={`/accounts/${row.id}`} density="tall">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-center gap-2 text-base font-semibold">
              <span
                aria-hidden
                className="size-2.5 flex-none rounded-chip"
                style={{ background: row.color }}
              />
              <span className="min-w-0 truncate">{row.name}</span>
            </span>
            {row.currency === displayCurrency || row.convertedMinor === null ? null : (
              <Money
                minor={row.balanceMinor}
                currency={row.currency}
                className="pl-[18px] text-[13px] text-ink-2"
              />
            )}
          </span>
          {row.currency === displayCurrency || row.convertedMinor === null ? (
            <Money
              minor={row.balanceMinor}
              currency={row.currency}
              className="text-[17px] font-semibold whitespace-nowrap"
            />
          ) : (
            <Approx
              minor={row.convertedMinor}
              currency={displayCurrency}
              mutedSign
              className="text-[17px] font-semibold whitespace-nowrap tabular-nums"
            />
          )}
        </ListRow>
      ))}
    </RowGroup>
  );
}
