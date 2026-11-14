import type { CurrencyCode } from "@/lib/currency";
import { toExpenseEntry, type ExpenseEntry } from "@/lib/expense-entry";
import { convertRow, sumConvertedByDay, type RateIndex } from "@/lib/fx/convert";
import type { ExpenseWithConversion } from "@/repositories/expenses";
import type { TopUpWithCurrency } from "@/repositories/top-ups";
import type { AccountTransfer } from "@/repositories/transfers";

export type TopUpWithConversion = Pick<
  TopUpWithCurrency,
  "id" | "amountMinor" | "currency" | "note" | "occurredOn"
> & {
  convertedMinor: number | null;
  displayCurrency: CurrencyCode;
};

export type TransferWithConversion = Omit<AccountTransfer, "enteredOn" | "createdAt"> & {
  convertedMinor: number | null;
  displayCurrency: CurrencyCode;
};

export type AccountDayItem =
  | { kind: "expense"; expense: ExpenseEntry }
  | { kind: "topUp"; topUp: TopUpWithConversion }
  | { kind: "transfer"; transfer: TransferWithConversion };

interface AccountDay {
  day: string;
  // Spent that day; null on a day without expenses.
  totalMinor: number | null;
  unconverted: number;
  items: AccountDayItem[];
}

function entryOf(item: AccountDayItem): { id: string } {
  switch (item.kind) {
    case "expense":
      return item.expense;
    case "topUp":
      return item.topUp;
    case "transfer":
      return item.transfer;
  }
}

export function isListed(
  days: { items: AccountDayItem[] }[],
  kind: AccountDayItem["kind"],
  id: string,
): boolean {
  return days.some((d) => d.items.some((i) => i.kind === kind && entryOf(i).id === id));
}

// Expenses must come ordered by date, newest first, as listExpenses returns them.
export function buildAccountDays(
  expenses: ExpenseWithConversion[],
  topUps: TopUpWithCurrency[],
  transfers: AccountTransfer[],
  display: CurrencyCode,
  index: RateIndex,
): AccountDay[] {
  const days = new Map<string, AccountDay>();
  const enteredAt = new Map<AccountDayItem, number>();
  for (const bucket of sumConvertedByDay(expenses, display, index)) {
    days.set(bucket.day, {
      day: bucket.day,
      totalMinor: bucket.totalMinor,
      unconverted: bucket.unconverted,
      items: bucket.items.map((expense) => {
        const item: AccountDayItem = { kind: "expense", expense: toExpenseEntry(expense) };
        enteredAt.set(item, expense.createdAt.getTime());
        return item;
      }),
    });
  }

  function addToDay(dayKey: string, createdAt: Date, item: AccountDayItem) {
    let day = days.get(dayKey);
    if (!day) {
      day = { day: dayKey, totalMinor: null, unconverted: 0, items: [] };
      days.set(dayKey, day);
    }
    day.items.push(item);
    enteredAt.set(item, createdAt.getTime());
  }

  for (const { id, amountMinor, currency, note, occurredOn, createdAt } of topUps) {
    const convertedMinor = convertRow(
      { amountMinor, currency, spentAt: occurredOn },
      display,
      index,
    );
    addToDay(occurredOn, createdAt, {
      kind: "topUp",
      topUp: { id, amountMinor, currency, note, occurredOn, convertedMinor, displayCurrency: display },
    });
  }

  for (const { enteredOn, createdAt, ...transfer } of transfers) {
    const convertedMinor = convertRow(
      { amountMinor: transfer.amountMinor, currency: transfer.currency, spentAt: enteredOn },
      display,
      index,
    );
    addToDay(enteredOn, createdAt, {
      kind: "transfer",
      transfer: { ...transfer, convertedMinor, displayCurrency: display },
    });
  }

  const at = (item: AccountDayItem) => enteredAt.get(item)!;
  return [...days.values()]
    .sort((a, b) => b.day.localeCompare(a.day))
    .map((day) => ({ ...day, items: day.items.sort((a, b) => at(b) - at(a)) }));
}
