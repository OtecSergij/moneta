import { describe, expect, it } from "vitest";
import {
  currentWeekFromMonday,
  formatDayHeading,
  formatRelativeDay,
  isFutureISO,
  lastMonth,
  lastNDays,
  parseISODate,
  sinceLastSalary,
  thisMonth,
  toISODate,
  todayISO,
} from "@/lib/dates";

// Fixed reference: Sunday, 17 May 2026 (local).
const NOW = new Date(2026, 4, 17);

describe("toISODate / parseISODate", () => {
  it("formats and round-trips a local date without UTC shift", () => {
    expect(toISODate(NOW)).toBe("2026-05-17");
    expect(toISODate(parseISODate("2026-01-01"))).toBe("2026-01-01");
  });

  it("does not drift across timezones (local midnight, not UTC)", () => {
    // A naive toISOString() would yield the previous day in negative offsets.
    expect(toISODate(parseISODate("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("todayISO", () => {
  it("returns the reference day", () => {
    expect(todayISO(NOW)).toBe("2026-05-17");
  });
});

describe("range helpers", () => {
  it("lastNDays is inclusive of both ends", () => {
    expect(lastNDays(7, NOW)).toEqual({ from: "2026-05-11", to: "2026-05-17" });
    expect(lastNDays(30, NOW)).toEqual({ from: "2026-04-18", to: "2026-05-17" });
    expect(lastNDays(1, NOW)).toEqual({ from: "2026-05-17", to: "2026-05-17" });
  });

  it("thisMonth spans the 1st through today", () => {
    expect(thisMonth(NOW)).toEqual({ from: "2026-05-01", to: "2026-05-17" });
  });

  it("lastMonth spans the whole previous month", () => {
    expect(lastMonth(NOW)).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  it("lastMonth handles January -> previous December", () => {
    expect(lastMonth(new Date(2026, 0, 10))).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });
});

describe("isFutureISO", () => {
  it("flags tomorrow but not today or yesterday", () => {
    expect(isFutureISO("2026-05-18", NOW)).toBe(true);
    expect(isFutureISO("2026-05-17", NOW)).toBe(false);
    expect(isFutureISO("2026-05-16", NOW)).toBe(false);
  });
});

describe("formatDayHeading", () => {
  it("omits the year for the current year (Russian genitive month)", () => {
    expect(formatDayHeading("2026-05-17", NOW)).toBe("17 мая");
    expect(formatDayHeading("2026-01-03", NOW)).toBe("3 января");
  });

  it("includes the year for other years", () => {
    expect(formatDayHeading("2025-05-17", NOW)).toBe("17 мая 2025");
  });
});

describe("formatRelativeDay", () => {
  it("returns 'Сегодня' for today", () => {
    expect(formatRelativeDay("2026-05-17", NOW)).toBe("Сегодня");
  });

  it("returns the weekday name within the previous 6 days", () => {
    expect(formatRelativeDay("2026-05-16", NOW)).toBe("Суббота"); // diff 1
    expect(formatRelativeDay("2026-05-11", NOW)).toBe("Понедельник"); // diff 6
  });

  it("falls back to the date from 7 days back and older", () => {
    expect(formatRelativeDay("2026-05-10", NOW)).toBe("10 мая"); // diff 7
    expect(formatRelativeDay("2025-05-10", NOW)).toBe("10 мая 2025");
  });
});

describe("currentWeekFromMonday", () => {
  it("spans Monday through the reference day midweek", () => {
    // Wednesday 13 May 2026 -> Monday 11 May.
    expect(currentWeekFromMonday(new Date(2026, 4, 13))).toEqual({
      from: "2026-05-11",
      to: "2026-05-13",
    });
  });

  it("includes the whole week when the reference day is Sunday", () => {
    expect(currentWeekFromMonday(NOW)).toEqual({
      from: "2026-05-11",
      to: "2026-05-17",
    });
  });

  it("collapses to a single day on Monday", () => {
    expect(currentWeekFromMonday(new Date(2026, 4, 11))).toEqual({
      from: "2026-05-11",
      to: "2026-05-11",
    });
  });
});

describe("sinceLastSalary", () => {
  it("falls back to the previous month when this month's days are still ahead", () => {
    // Salary on the 3rd and 17th; today 2 June → both June days are future, so
    // the last salary was 17 May (the headline business example).
    expect(sinceLastSalary([3, 17], new Date(2026, 5, 2))).toEqual({
      from: "2026-05-17",
      to: "2026-06-02",
    });
  });

  it("uses the latest day already passed this month", () => {
    // Between the 3rd and 17th → last salary was the 3rd.
    expect(sinceLastSalary([3, 17], new Date(2026, 5, 10))).toEqual({
      from: "2026-06-03",
      to: "2026-06-10",
    });
    // On/after the 17th → the 17th.
    expect(sinceLastSalary([3, 17], new Date(2026, 5, 20))).toEqual({
      from: "2026-06-17",
      to: "2026-06-20",
    });
  });

  it("includes the salary day itself (inclusive start)", () => {
    expect(sinceLastSalary([3, 17], new Date(2026, 5, 17))).toEqual({
      from: "2026-06-17",
      to: "2026-06-17",
    });
  });

  it("does not depend on input order", () => {
    expect(sinceLastSalary([17, 3], new Date(2026, 5, 10)).from).toBe(
      "2026-06-03",
    );
  });

  it("clamps a day past the month length to its last day", () => {
    // 31st, today 30 June (30-day month) → clamps to 30 June.
    expect(sinceLastSalary([31], new Date(2026, 5, 30))).toEqual({
      from: "2026-06-30",
      to: "2026-06-30",
    });
    // 31st, today mid-June → June's 31st hasn't happened; fall back to 31 May.
    expect(sinceLastSalary([31], new Date(2026, 5, 15)).from).toBe(
      "2026-05-31",
    );
    // 30th, today 1 March → fall back to 28 Feb (2026 is not a leap year).
    expect(sinceLastSalary([30], new Date(2026, 2, 1)).from).toBe("2026-02-28");
  });

  it("crosses the year boundary into the previous December", () => {
    expect(sinceLastSalary([17], new Date(2026, 0, 5))).toEqual({
      from: "2025-12-17",
      to: "2026-01-05",
    });
  });
});
