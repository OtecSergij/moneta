import type { ReactNode } from "react";
import type { CurrencyCode } from "@/lib/currency";
import { TotalMoney } from "@/components/ui/total-money";
import { RowGroup } from "@/components/kit/row-group";

export interface Day<T> {
  day: string;
  heading: string;
  // Spent that day; null on a day with nothing spent.
  totalMinor: number | null;
  // Expenses of the day no rate could value; the total is marked incomplete.
  unconverted: number;
  items: T[];
}

export function DayList<T>({
  days,
  displayCurrency,
  children,
}: {
  days: Day<T>[];
  displayCurrency: CurrencyCode;
  children: (item: T) => ReactNode;
}) {
  return (
    <div className="mx-4 mt-1 flex flex-col">
      {days.map((day) => (
        <section key={day.day} className="flex flex-col">
          <div className="flex items-baseline justify-between gap-2 px-1 pt-[18px] pb-2">
            <h2 className="text-sm font-semibold">{day.heading}</h2>
            {day.totalMinor === null ? null : (
              <TotalMoney
                minor={day.totalMinor}
                currency={displayCurrency}
                unconverted={day.unconverted}
                className="text-[13px] text-ink-2"
              />
            )}
          </div>
          <RowGroup>{day.items.map((item) => children(item))}</RowGroup>
        </section>
      ))}
    </div>
  );
}
