// Date helpers for the expense screens. All "business dates" (spentAt, range
// filters) are local calendar dates as "YYYY-MM-DD" strings — never UTC
// timestamps — because "today" and "this month" are defined in the user's
// local timezone, and the `expenses.spent_at` column is a bare `date`.
//
// Every function takes an optional `now` so callers (and tests) can pin the
// reference instant; app code relies on the `new Date()` default.

import {
  differenceInCalendarDays,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";
import { ru } from "date-fns/locale";
import { z } from "zod";

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

export const TIME_ZONE_COOKIE = "tz";

/**
 * The wall-clock time in `timeZone` as a Date whose local fields carry it, so
 * the helpers below compute the user's calendar day on a server in another
 * zone. An unknown or missing zone leaves `now` as is.
 */
export function zonedNow(
  timeZone: string | undefined,
  now: Date = new Date(),
): Date {
  if (!timeZone) return now;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    }).formatToParts(now);
  } catch {
    return now;
  }
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return new Date(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}

/** Today as "YYYY-MM-DD" in local time — default for new expenses, max for the picker. */
export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

/** Single-day range covering today. */
export function todayRange(now: Date = new Date()): DateRange {
  const today = toISODate(now);
  return { from: today, to: today };
}

/**
 * Current week from Monday through today — the home screen's default summary
 * window. Monday-start regardless of system locale.
 */
export function currentWeekFromMonday(now: Date = new Date()): DateRange {
  return {
    from: toISODate(startOfWeek(now, { weekStartsOn: 1 })),
    to: toISODate(now),
  };
}

/** Current month from the 1st through today. */
export function currentMonthFromFirst(now: Date = new Date()): DateRange {
  return { from: toISODate(startOfMonth(now)), to: toISODate(now) };
}

/** The whole Monday–Sunday week containing `now`. */
export function weekRange(now: Date = new Date()): DateRange {
  return {
    from: toISODate(startOfWeek(now, { weekStartsOn: 1 })),
    to: toISODate(endOfWeek(now, { weekStartsOn: 1 })),
  };
}

/** "9–15 ноября", "27 октября – 2 ноября", "29 декабря 2025 – 4 января 2026". */
export function weekRangeLabel({ from, to }: DateRange): string {
  const start = parseISODate(from);
  const end = parseISODate(to);
  const opts = { locale: ru };
  if (from.slice(0, 4) !== to.slice(0, 4)) {
    return `${format(start, "d MMMM yyyy", opts)} – ${format(end, "d MMMM yyyy", opts)}`;
  }
  if (from.slice(0, 7) !== to.slice(0, 7)) {
    return `${format(start, "d MMMM", opts)} – ${format(end, "d MMMM", opts)}`;
  }
  return `${format(start, "d", opts)}–${format(end, "d MMMM", opts)}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function weekday(iso: string, pattern: "EEEE" | "EEEEEE"): string {
  return capitalize(format(parseISODate(iso), pattern, { locale: ru }));
}

/** Date chip label: "Вт, 10 ноября" (current year) or "Вт, 10 ноября 2025". */
export function formatChipDate(iso: string, now: Date = new Date()): string {
  return `${weekday(iso, "EEEEEE")}, ${formatDayHeading(iso, now)}`;
}

/** History day title: "Вторник, 10 ноября" (current year) or "Вторник, 10 ноября 2025". */
export function formatDayTitle(iso: string, now: Date = new Date()): string {
  return `${weekday(iso, "EEEE")}, ${formatDayHeading(iso, now)}`;
}

/** Quick range presets for the history screen. */
export const RANGE_PRESETS = [
  { key: "today", label: "Сегодня", range: (now?: Date) => todayRange(now) },
  {
    key: "week",
    label: "За неделю",
    range: (now?: Date) => currentWeekFromMonday(now),
  },
  {
    key: "month",
    label: "За месяц",
    range: (now?: Date) => currentMonthFromFirst(now),
  },
] as const;

const isoDate = z.iso.date();

/** History range from the URL; missing, invalid or reversed params fall back to the current week from Monday. */
export function resolveHistoryRange(
  from?: string,
  to?: string,
  now: Date = new Date(),
): DateRange {
  const f = isoDate.safeParse(from);
  const t = isoDate.safeParse(to);
  if (f.success && t.success && f.data <= t.data) {
    return { from: f.data, to: t.data };
  }
  return currentWeekFromMonday(now);
}

/** True if `iso` is strictly after today (used to reject future expense dates). */
export function isFutureISO(iso: string, now: Date = new Date()): boolean {
  // Lexicographic comparison is chronological for zero-padded "YYYY-MM-DD".
  return iso > todayISO(now);
}

export const FUTURE_DATE_ERROR = "Дата не может быть в будущем";

/** How far back a form lets a new entry date go; the nightly rate gap pass reaches two days further. */
export const MAX_ENTRY_AGE_DAYS = 90;

/** The earliest entry date a form accepts: today − MAX_ENTRY_AGE_DAYS, in local time. */
export function minEntryDate(now: Date = new Date()): string {
  return toISODate(subDays(now, MAX_ENTRY_AGE_DAYS));
}

export const OLD_DATE_ERROR = `Дата не может быть старше ${MAX_ENTRY_AGE_DAYS} дней`;

/** Day heading for grouped lists: "17 мая" (current year) or "17 мая 2025". */
export function formatDayHeading(iso: string, now: Date = new Date()): string {
  const sameYear = iso.slice(0, 4) === todayISO(now).slice(0, 4);
  return format(parseISODate(iso), sameYear ? "d MMMM" : "d MMMM yyyy", {
    locale: ru,
  });
}

/**
 * Relative day label for the home list: "Сегодня", "Вчера", the weekday name
 * ("Вторник") for earlier days of the current Monday-based week, otherwise the
 * day heading ("1 июня" / "1 июня 2025").
 */
export function formatRelativeDay(iso: string, now: Date = new Date()): string {
  const diff = differenceInCalendarDays(now, parseISODate(iso));
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  const monday = toISODate(startOfWeek(now, { weekStartsOn: 1 }));
  if (diff > 1 && iso >= monday) return weekday(iso, "EEEE");
  return formatDayHeading(iso, now);
}
