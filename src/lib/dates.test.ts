import { describe, expect, it } from "vitest";
import {
  currentWeekFromMonday,
  formatRelativeDay,
  isFutureISO,
  lastNDays,
  parseISODate,
  toISODate,
  todayRange,
} from "@/lib/dates";

// Fixed reference: Sunday, 17 May 2026 (local).
const NOW = new Date(2026, 4, 17);

describe("toISODate / parseISODate", () => {
  it("formats and round-trips a local date without UTC shift", () => {
    expect(toISODate(NOW)).toBe("2026-05-17");
    // A naive toISOString() would yield the previous day in negative offsets.
    expect(toISODate(parseISODate("2026-01-01"))).toBe("2026-01-01");
    expect(toISODate(parseISODate("2026-12-31"))).toBe("2026-12-31");
  });
});

describe("range helpers", () => {
  it("lastNDays is inclusive of both ends", () => {
    expect(lastNDays(7, NOW)).toEqual({ from: "2026-05-11", to: "2026-05-17" });
    expect(lastNDays(30, NOW)).toEqual({ from: "2026-04-18", to: "2026-05-17" });
    expect(lastNDays(1, NOW)).toEqual({ from: "2026-05-17", to: "2026-05-17" });
  });

  it("todayRange collapses to a single day", () => {
    expect(todayRange(NOW)).toEqual({ from: "2026-05-17", to: "2026-05-17" });
  });
});

describe("isFutureISO", () => {
  it("flags tomorrow but not today or yesterday", () => {
    expect(isFutureISO("2026-05-18", NOW)).toBe(true);
    expect(isFutureISO("2026-05-17", NOW)).toBe(false);
    expect(isFutureISO("2026-05-16", NOW)).toBe(false);
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
