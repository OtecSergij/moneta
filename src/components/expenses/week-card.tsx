import type { CurrencyCode } from "@/lib/currency";
import { weekRangeLabel, type DateRange } from "@/lib/dates";
import { TotalMoney } from "@/components/ui/total-money";
import { SummaryCard } from "@/components/kit/summary-card";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const BAR_MAX_PX = 56;
const BAR_MIN_PX = 6;
const BAR_EMPTY_PX = 4;

type WeekDay = { day: string; totalMinor: number };

export function WeekCard({
  range,
  today,
  days,
  totalMinor,
  unconverted,
  currency,
}: {
  range: DateRange;
  today: string;
  days: WeekDay[];
  totalMinor: number;
  unconverted: number;
  currency: CurrencyCode;
}) {
  const max = Math.max(0, ...days.map((d) => d.totalMinor));

  return (
    <SummaryCard
      ariaLabel="Траты на этой неделе"
      label={`На этой неделе · ${weekRangeLabel(range)}`}
      className="mx-4 mt-2"
    >
      <TotalMoney
        size="hero"
        minor={totalMinor}
        currency={currency}
        unconverted={unconverted}
      />
      <span aria-hidden className="mt-3.5 grid grid-cols-7 gap-2">
        {days.map((d, i) => {
          const isToday = d.day === today;
          const empty = d.day > today || d.totalMinor <= 0;
          const height = empty
            ? BAR_EMPTY_PX
            : Math.max(BAR_MIN_PX, Math.round((d.totalMinor / max) * BAR_MAX_PX));
          return (
            <span key={d.day} className="flex flex-col gap-1.5">
              <span className="flex h-14 items-end">
                <span
                  className={cn(
                    "w-full rounded-[6px]",
                    empty ? "bg-line" : isToday ? "bg-primary" : "bg-bar-past",
                  )}
                  style={{ height }}
                />
              </span>
              <span
                className={cn(
                  "text-center text-[11px]",
                  isToday ? "font-bold text-ink" : "font-medium text-ink-3",
                )}
              >
                {WEEKDAYS[i]}
              </span>
            </span>
          );
        })}
      </span>
    </SummaryCard>
  );
}
