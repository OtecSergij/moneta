import type { CurrencyCode } from "@/lib/currency";
import type { AccountsSummary } from "@/lib/accounts-total";
import { TotalMoney } from "@/components/ui/total-money";

export function AccountsTotal({
  summary,
  currency,
}: {
  summary: AccountsSummary;
  currency: CurrencyCode;
}) {
  const shares = summary.rows.filter((row) => row.sharePermille > 0);
  return (
    <section
      aria-label="Всего на счетах"
      className="mx-4 mt-2 flex flex-col gap-1 rounded-card bg-card p-5"
    >
      <span className="text-sm text-ink-2">Всего на счетах</span>
      <TotalMoney
        minor={summary.totalMinor}
        currency={currency}
        unconverted={summary.unconverted}
        size="period"
        noteLabel="Не пересчитано счетов"
        noteReason="нет курса на сегодня"
      />
      <span className="text-[13px] text-ink-2">По курсу на сегодня</span>
      {shares.length > 0 ? (
        <span aria-hidden className="mt-3.5 flex h-2 gap-[3px]">
          {shares.map((row) => (
            <span
              key={row.id}
              className="rounded-chip"
              style={{ flex: `${row.sharePermille} 1 0`, background: row.color }}
            />
          ))}
        </span>
      ) : null}
    </section>
  );
}
