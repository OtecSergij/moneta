// Date helpers for the expense screens. All "business dates" (spentAt, range
// filters) are local calendar dates as "YYYY-MM-DD" strings — never UTC
// timestamps — because "today" and "this month" are defined in the user's
// local timezone, and the `expenses.spent_at` column is a bare `date`.
//
// Every function takes an optional `now` so callers (and tests) can pin the
// reference instant; app code relies on the `new Date()` default.

import {
  differenceInCalendarDays,
  endOfMonth,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { ru } from "date-fns/locale";

export interface DateRange {
  from: string; // inclusive "YYYY-MM-DD"
  to: string; // inclusive "YYYY-MM-DD"
}

/** Format a Date as a local "YYYY-MM-DD" (date-fns `format` uses local time). */
export function toISODate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Parse "YYYY-MM-DD" to a local-midnight Date (no UTC shift). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Today as "YYYY-MM-DD" in local time — default for new expenses, max for the picker. */
export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

/** Last N calendar days ending today, inclusive. `lastNDays(7)` spans 7 dates. */
export function lastNDays(n: number, now: Date = new Date()): DateRange {
  return { from: toISODate(subDays(now, n - 1)), to: toISODate(now) };
}

/** 1st of the current month through today. */
export function thisMonth(now: Date = new Date()): DateRange {
  return { from: toISODate(startOfMonth(now)), to: toISODate(now) };
}

/** 1st through last day of the previous month. */
export function lastMonth(now: Date = new Date()): DateRange {
  const prev = subMonths(now, 1);
  return { from: toISODate(startOfMonth(prev)), to: toISODate(endOfMonth(prev)) };
}

/**
 * Current week from Monday through today — the home screen's default summary
 * window (business-spec §5.1). Monday-start regardless of system locale.
 */
export function currentWeekFromMonday(now: Date = new Date()): DateRange {
  return {
    from: toISODate(startOfWeek(now, { weekStartsOn: 1 })),
    to: toISODate(now),
  };
}

/** Days in a given month (0-indexed month, JS convention) — 28–31. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Range from the most recent salary day through today — the History
 * "с последней зарплаты" preset (business-spec §5.2/§5.3). `salaryDays` are
 * calendar days of the month (1–31); the latest one that has already occurred
 * (this month, otherwise the last one in the previous month) is the range
 * start. A day past the month's length is clamped to its last day (the 31st in
 * a 30-day month → the 30th). Expects a non-empty `salaryDays`.
 */
export function sinceLastSalary(
  salaryDays: number[],
  now: Date = new Date(),
): DateRange {
  const today = toISODate(now);
  if (salaryDays.length === 0) return { from: today, to: today };

  const year = now.getFullYear();
  const month = now.getMonth();
  const dayOfMonth = now.getDate();

  // Latest salary day this month that is on or before today.
  let start: Date | null = null;
  for (const day of salaryDays) {
    const clamped = Math.min(day, daysInMonth(year, month));
    if (clamped <= dayOfMonth) {
      const candidate = new Date(year, month, clamped);
      if (!start || candidate > start) start = candidate;
    }
  }

  // None reached yet this month → the last salary day of the previous month.
  if (!start) {
    const prevYear = month === 0 ? year - 1 : year;
    const prevMonth = month === 0 ? 11 : month - 1;
    const latest = Math.max(...salaryDays);
    start = new Date(
      prevYear,
      prevMonth,
      Math.min(latest, daysInMonth(prevYear, prevMonth)),
    );
  }

  return { from: toISODate(start), to: today };
}

/** Quick range presets for the history screen (business-spec §5.2). */
export const RANGE_PRESETS = [
  { key: "7d", label: "7 дней", range: (now?: Date) => lastNDays(7, now) },
  { key: "30d", label: "30 дней", range: (now?: Date) => lastNDays(30, now) },
  { key: "thisMonth", label: "Этот месяц", range: (now?: Date) => thisMonth(now) },
  { key: "lastMonth", label: "Прошлый месяц", range: (now?: Date) => lastMonth(now) },
] as const;

export type RangePresetKey = (typeof RANGE_PRESETS)[number]["key"];

/** True if `iso` is strictly after today (used to reject future expense dates). */
export function isFutureISO(iso: string, now: Date = new Date()): boolean {
  // Lexicographic comparison is chronological for zero-padded "YYYY-MM-DD".
  return iso > todayISO(now);
}

/** Day heading for grouped lists: "17 мая" (current year) or "17 мая 2025". */
export function formatDayHeading(iso: string, now: Date = new Date()): string {
  const sameYear = iso.slice(0, 4) === todayISO(now).slice(0, 4);
  return format(parseISODate(iso), sameYear ? "d MMMM" : "d MMMM yyyy", {
    locale: ru,
  });
}

/**
 * Relative day label, shared everywhere a single expense date is shown (history
 * tabs + home list): "Сегодня" for today, the weekday name ("Вторник") for the
 * previous 6 days, otherwise the day heading ("1 июня" / "1 июня 2025").
 */
export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const d = parseISODate(iso);
  const diff = differenceInCalendarDays(now, d);
  if (diff === 0) return "Сегодня";
  if (diff >= 1 && diff <= 6) {
    const weekday = format(d, "EEEE", { locale: ru });
    return weekday.charAt(0).toUpperCase() + weekday.slice(1);
  }
  return formatDayHeading(iso, now);
}
